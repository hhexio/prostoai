import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { Context, Markup } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { RouterService } from '../ai/router.service';
import { UsersService } from '../users/users.service';
import { ReferralService } from '../users/referral.service';
import { getModel } from '../ai/models.config';
import { MESSAGES } from './messages';
import { buyKeyboard, backToMenuKeyboard } from './keyboards';
import { getHelper } from '../helpers/helpers.config';
import { ConfigService } from '@nestjs/config';

const IMAGE_MODEL_EMOJI: Record<string, string> = {
  'nano-banana-2': '🍌',
  'gpt-image-1-mini': '🖼',
  'gpt-image-1': '🎨',
  'gpt-image-1.5': '✨',
  'dall-e-3': '🌈',
};

interface MediaGroupEntry {
  photos: Buffer[];
  caption: string;
  ctx: Context;
  userId: number;
  telegramId: bigint;
  modelId: string;
  timestamp: number;
}

const MAX_TEXT_LENGTH = 4000;
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_VOICE_DURATION = 300; // 5 minutes
const MAX_MEDIA_GROUP_PHOTOS = 3;

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private readonly mediaGroupBuffer = new Map<string, MediaGroupEntry>();

  private readonly BLOCKED_PATTERNS = [
    /child\s*(porn|sex|nude)/i,
    /детск[а-яёА-ЯЁ]*\s*(порн|секс|голы)/i,
    /как\s*(сделать|создать|изготовить)\s*(бомб|взрывч|оружи|наркотик)/i,
    /how\s*to\s*(make|build|create)\s*(bomb|weapon|drug|explosive)/i,
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly router: RouterService,
    private readonly users: UsersService,
    private readonly referral: ReferralService,
    private readonly config: ConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async processMessage(ctx: Context, type: 'text' | 'photo' | 'voice' | 'audio') {
    const telegramId = BigInt(ctx.from!.id);
    const user = await this.users.findOrCreate(
      telegramId,
      ctx.from!.username,
      ctx.from!.first_name,
    );

    const isAdmin = ctx.from!.id.toString() === this.config.get('ADMIN_TELEGRAM_ID');

    // Rate limit check (admin exempt)
    if (!isAdmin) {
      const allowed = await this.checkRateLimit(user.id, ctx);
      if (!allowed) return;
    }

    // Input validation
    let messageText = type === 'text' ? (ctx.message as any)?.text : undefined;

    // Text length validation
    if (messageText && messageText.length > MAX_TEXT_LENGTH) {
      messageText = messageText.substring(0, MAX_TEXT_LENGTH);
      await ctx.reply('⚠️ Сообщение обрезано до 4000 символов.');
    }

    // Photo size validation
    if (type === 'photo') {
      const photos = (ctx.message as any)?.photo;
      if (photos) {
        const largest = photos[photos.length - 1];
        if (largest.file_size && largest.file_size > MAX_PHOTO_SIZE) {
          await ctx.reply(
            '⚠️ Фото слишком большое (макс. 5 МБ). Отправьте фото меньшего размера.',
            backToMenuKeyboard(),
          );
          return;
        }
      }
    }

    // Voice duration validation
    if (type === 'voice' || type === 'audio') {
      const voice = (ctx.message as any)?.voice || (ctx.message as any)?.audio;
      if (voice && voice.duration > MAX_VOICE_DURATION) {
        await ctx.reply(
          '⚠️ Аудио слишком длинное (макс. 5 минут).',
          backToMenuKeyboard(),
        );
        return;
      }
    }

    // Feedback state check
    const userState = await this.redis.get(`state:${user.telegramId}`);
    if (userState === 'awaiting_feedback') {
      const feedbackText = messageText || (ctx.message as any)?.caption || '[фото/голосовое]';
      await this.prisma.feedback.create({ data: { userId: user.id, message: feedbackText } });
      await this.redis.del(`state:${user.telegramId}`);
      await ctx.reply(
        '✅ Спасибо за обратную связь! Мы обязательно прочитаем ваше сообщение.',
        Markup.inlineKeyboard([[Markup.button.callback('◀️ В главное меню', 'back_menu')]]),
      );
      const adminId = this.config.get('ADMIN_TELEGRAM_ID');
      if (adminId) {
        try {
          await ctx.telegram.sendMessage(
            adminId,
            `📩 Новый отзыв от пользователя #${user.id} (@${user.username || 'без username'}):\n\n${feedbackText}`,
          );
        } catch {}
      }
      return;
    }

    // Content filter
    const textToCheck = messageText || (ctx.message as any)?.caption || '';
    if (textToCheck && this.isBlockedContent(textToCheck)) {
      await ctx.reply(
        '🚫 Этот запрос нарушает правила использования сервиса.',
        backToMenuKeyboard(),
      );
      this.logger.warn(`Blocked content from user ${user.telegramId}`);
      return;
    }

    // Require explicit model selection
    if (!user.selectedModel && (type === 'text' || type === 'photo')) {
      const hint = type === 'photo'
        ? 'Для анализа фото выберите чат-модель, для редактирования — модель генерации изображений.'
        : 'Нажмите кнопку ниже, чтобы выбрать модель для работы.';
      await ctx.reply(
        `⚠️ Сначала выберите модель.\n\n${hint}`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🤖 Выбрать модель', 'select_model')],
          [Markup.button.callback('◀️ В главное меню', 'back_menu')],
        ]),
      );
      return;
    }

    // Voice always routes through Whisper; text/photo require explicit selection
    const modelId = (type === 'voice' || type === 'audio') ? 'whisper' : user.selectedModel!;
    const model = getModel(modelId);
    const isImageModel = model?.category === 'image';

    // Image-specific rate limit
    if (!isAdmin && isImageModel) {
      const imgAllowed = await this.checkImageRateLimit(user.id, ctx);
      if (!imgAllowed) return;
    }

    // Media group handling for all image models (multiple photos in one message)
    const mediaGroupId = (ctx.message as any)?.media_group_id;
    if (type === 'photo' && mediaGroupId && model?.category === 'image') {
      await this.handleMediaGroupPhoto(ctx, mediaGroupId, user, modelId);
      return;
    }

    // Estimate cost
    const estimatedCost = this.ai.estimateCost(modelId);

    // Balance check (admin exempt)
    if (!isAdmin && user.balance < estimatedCost) {
      await ctx.reply(MESSAGES.NO_BALANCE, {
        parse_mode: 'HTML',
        ...buyKeyboard(),
      });
      return;
    }

    // Send status message
    let statusText: string;
    switch (model?.category) {
      case 'chat':
        statusText = '💬 Думаю над ответом... ⏳';
        break;
      case 'image':
        statusText = '🎨 Генерирую изображение... Это может занять 10-30 секунд ⏳';
        break;
      case 'vision':
        statusText = '📸 Анализирую фото... ⏳';
        break;
      case 'audio':
        statusText = '🎤 Распознаю аудио... ⏳';
        break;
      default:
        statusText = '⏳ Обрабатываю...';
    }

    const statusMsg = await ctx.reply(statusText);

    // Resolve active helper system prompt (chat/vision only, not image models)
    let systemPrompt: string | undefined;
    if (!isImageModel) {
      const helperId = await this.users.getActiveHelperId(user.id);
      if (helperId) {
        systemPrompt = getHelper(helperId)?.systemPrompt;
      }
    }

    // Call AI
    let aiResponse;
    try {
      if (type === 'photo' && model?.endpoint === 'google') {
        const photoBuffer = await this.downloadPhoto(ctx);
        const imageBase64 = photoBuffer.toString('base64');
        const caption = (ctx.message as any)?.caption || 'Edit this image';
        aiResponse = await this.ai.generateImageGemini(modelId, caption, imageBase64);
      } else if (type === 'photo' && isImageModel) {
        const photoBuffer = await this.downloadPhoto(ctx);
        const caption = (ctx.message as any)?.caption || 'Edit this image';
        aiResponse = await this.ai.generateImageWithReference(modelId, caption, photoBuffer);
      } else if (type === 'photo') {
        const photoBuffer = await this.downloadPhoto(ctx);
        const base64 = photoBuffer.toString('base64');
        const caption = (ctx.message as any)?.caption;
        aiResponse = await this.ai.analyzePhoto(modelId, base64, caption, systemPrompt);
      } else if (type === 'voice' || type === 'audio') {
        const audioBuffer = await this.downloadVoice(ctx);
        aiResponse = await this.ai.transcribeAudio(audioBuffer);
        if (aiResponse.audioText) {
          if (!user.selectedModel) {
            // Only transcription — user hasn't chosen a chat model yet
            aiResponse.text = `📝 <b>Расшифровка:</b> ${aiResponse.audioText}`;
            // Will fall through to normal response + deduct Whisper cost
            // After sending, prompt to select model
          } else {
            const textResponse = await this.ai.chat(
              user.selectedModel,
              aiResponse.audioText,
              systemPrompt,
            );
            aiResponse.text = `📝 <b>Расшифровка:</b> ${aiResponse.audioText}\n\n💬 <b>Ответ:</b> ${textResponse.text}`;
            aiResponse.totalCost += textResponse.totalCost;
            aiResponse.inputTokens += textResponse.inputTokens;
            aiResponse.outputTokens += textResponse.outputTokens;
          }
        }
      } else if (isImageModel && model?.endpoint === 'google') {
        aiResponse = await this.ai.generateImageGemini(modelId, messageText);
      } else if (isImageModel) {
        aiResponse = await this.ai.generateImage(modelId, messageText);
      } else {
        aiResponse = await this.ai.chat(modelId, messageText, systemPrompt);
      }
    } catch (err) {
      let errorMsg = MESSAGES.ERROR_GENERAL;
      if (err.message === 'TIMEOUT') errorMsg = MESSAGES.ERROR_TIMEOUT;
      else if (err.message === 'RATE_LIMIT') errorMsg = MESSAGES.ERROR_RATE_LIMIT;
      else if (err.message === 'SERVICE_UNAVAILABLE') errorMsg = MESSAGES.ERROR_SERVICE;
      await ctx.reply(errorMsg, { parse_mode: 'HTML', ...backToMenuKeyboard() });
      try { await ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id); } catch {}
      this.logger.error(`AI error: user=${user.telegramId}, model=${modelId}`);
      return;
    }

    // Deduct ACTUAL cost after AI call (not estimated)
    const actualCost = aiResponse.totalCost;
    let tokensDeducted = false;
    if (!isAdmin) {
      const deducted = await this.deductTokens(user.id, actualCost);
      if (!deducted) {
        // Balance drained by concurrent request — log but don't block response
        this.logger.warn(`Failed to deduct ${actualCost} from user ${user.id}, balance insufficient after AI call`);
      } else {
        tokensDeducted = true;
      }
    }

    // Save usage
    await this.prisma.usage.create({
      data: {
        userId: user.id,
        model: modelId,
        inputTokens: aiResponse.inputTokens,
        outputTokens: aiResponse.outputTokens,
        balanceCost: actualCost,
        responseTime: aiResponse.responseTime,
        isFree: isAdmin,
      },
    });

    // Send response with 413 handling
    let responseSent = false;
    try {
      if (aiResponse.imageBuffer) {
        // 1. Send compressed preview as photo
        try {
          await ctx.replyWithPhoto({ source: aiResponse.imageBuffer });
        } catch (photoErr: any) {
          this.logger.warn(`Photo preview failed: ${photoErr.message}`);
        }
        // 2. Send original as document for full quality
        const ext = modelId.includes('dall-e') ? 'jpeg' : 'png';
        await ctx.replyWithDocument(
          { source: aiResponse.imageBuffer, filename: `${model!.displayName.replace(/\s/g, '_')}.${ext}` },
          { caption: '🖼 Оригинал в полном качестве' },
        );
        responseSent = true;
      } else if (aiResponse.imageUrl) {
        await ctx.replyWithPhoto({ url: aiResponse.imageUrl });
        responseSent = true;
      } else if (aiResponse.text) {
        await ctx.reply(aiResponse.text, { parse_mode: 'HTML' });
        responseSent = true;
      } else {
        this.logger.warn(`Empty AI response: user=${user.telegramId}, model=${modelId}`);
        await ctx.reply('😔 AI вернул пустой ответ. Попробуйте переформулировать запрос.', backToMenuKeyboard());
      }
    } catch (err) {
      if (tokensDeducted) {
        await this.refundTokens(user.id, actualCost);
      }
      await ctx.reply(
        '😔 Что-то пошло не так. Попробуйте немного позже.\n\n' +
        (tokensDeducted ? '✅ Токены возвращены на ваш баланс.' : ''),
        { parse_mode: 'HTML', ...backToMenuKeyboard() },
      );
      this.logger.error(`Send error: user=${user.telegramId}, model=${modelId}`);
    }

    // Delete status message
    try { await ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id); } catch {}

    // Post-response UX: show cost + action buttons
    if (responseSent) {
      const updatedUser = await this.prisma.user.findUnique({ where: { id: user.id }, select: { balance: true } });
      const remainingBalance = updatedUser?.balance ?? 0;

      if (isImageModel) {
        const emoji = IMAGE_MODEL_EMOJI[modelId] || '🎨';
        await ctx.reply(
          `${emoji} Сгенерировано в ${model!.displayName}\n💰 Стоимость: ${actualCost.toLocaleString('ru-RU')} токенов. Осталось: ${remainingBalance.toLocaleString('ru-RU')} токенов.`,
          Markup.inlineKeyboard([
            [Markup.button.callback('🎨 Создать ещё', `new_image_${modelId}`)],
            [Markup.button.callback('◀️ В главное меню', 'back_menu')],
          ]),
        );
      } else {
        await ctx.reply(
          `💰 −${actualCost.toLocaleString('ru-RU')} токенов. Осталось: ${remainingBalance.toLocaleString('ru-RU')}`,
          Markup.inlineKeyboard([
            [Markup.button.callback('◀️ В главное меню', 'back_menu')],
          ]),
        );
      }
    }

    // Check if this is user's first request — apply deferred referral bonus
    const usageCount = await this.prisma.usage.count({ where: { userId: user.id } });
    if (usageCount === 1) {
      await this.referral.applyReferralBonus(user.id);
    }
  }

  private async handleMediaGroupPhoto(
    ctx: Context,
    mediaGroupId: string,
    user: { id: number; balance: number; selectedModel: string | null },
    modelId: string,
  ) {
    const photoBuffer = await this.downloadPhoto(ctx);
    const existing = this.mediaGroupBuffer.get(mediaGroupId);

    if (existing) {
      // Limit photos
      if (existing.photos.length >= MAX_MEDIA_GROUP_PHOTOS) {
        return;
      }
      existing.photos.push(photoBuffer);
    } else {
      const caption = (ctx.message as any)?.caption || '';
      this.mediaGroupBuffer.set(mediaGroupId, {
        photos: [photoBuffer],
        caption,
        ctx,
        userId: user.id,
        telegramId: BigInt(ctx.from!.id),
        modelId,
        timestamp: Date.now(),
      });

      setTimeout(() => this.processMediaGroup(mediaGroupId), 2000);
    }
  }

  private async processMediaGroup(mediaGroupId: string) {
    const group = this.mediaGroupBuffer.get(mediaGroupId);
    if (!group) return;
    this.mediaGroupBuffer.delete(mediaGroupId);

    const { ctx, userId, modelId } = group;
    const isAdmin = ctx.from!.id.toString() === this.config.get('ADMIN_TELEGRAM_ID');
    const estimatedCost = this.ai.estimateCost(modelId);

    // Balance check (admin exempt)
    if (!isAdmin) {
      const balance = await this.getUserBalance(userId);
      if (balance < estimatedCost) {
        await ctx.reply(MESSAGES.NO_BALANCE, { parse_mode: 'HTML', ...buyKeyboard() });
        return;
      }
    }

    // Note if photos were capped
    const wasCapped = group.photos.length >= MAX_MEDIA_GROUP_PHOTOS;

    const statusMsg = await ctx.reply('🎨 Генерирую изображение... Это может занять 10-30 секунд ⏳');

    try {
      const model = getModel(modelId);
      let aiResponse;

      if (model?.endpoint === 'google') {
        const parts: any[] = [];
        parts.push({ text: group.caption || 'Edit these images' });
        for (const photo of group.photos) {
          parts.push({ inline_data: { mime_type: 'image/jpeg', data: photo.toString('base64') } });
        }
        aiResponse = await this.ai.generateImageGeminiRaw(parts);
      } else {
        aiResponse = await this.ai.generateImageWithMultipleReferences(
          modelId,
          group.caption || 'Edit these images',
          group.photos,
        );
      }

      // Deduct ACTUAL cost after AI call
      const actualCost = aiResponse.totalCost;
      let tokensDeducted = false;
      if (!isAdmin) {
        const deducted = await this.deductTokens(userId, actualCost);
        if (!deducted) {
          this.logger.warn(`Failed to deduct ${actualCost} from user ${userId}, balance insufficient after AI call`);
        } else {
          tokensDeducted = true;
        }
      }

      // Save usage
      await this.prisma.usage.create({
        data: {
          userId,
          model: modelId,
          inputTokens: aiResponse.inputTokens,
          outputTokens: aiResponse.outputTokens,
          balanceCost: actualCost,
          responseTime: aiResponse.responseTime,
          isFree: isAdmin,
        },
      });

      // Send response
      try {
        if (aiResponse.imageBuffer) {
          // 1. Send compressed preview as photo
          try {
            await ctx.replyWithPhoto({ source: aiResponse.imageBuffer });
          } catch (photoErr: any) {
            this.logger.warn(`Photo preview failed: ${photoErr.message}`);
          }
          // 2. Send original as document for full quality
          const ext = modelId.includes('dall-e') ? 'jpeg' : 'png';
          await ctx.replyWithDocument(
            { source: aiResponse.imageBuffer, filename: `${model?.displayName.replace(/\s/g, '_') ?? modelId}.${ext}` },
            { caption: '🖼 Оригинал в полном качестве' },
          );
        } else if (aiResponse.text) {
          await ctx.reply(aiResponse.text, { parse_mode: 'HTML' });
        } else {
          await ctx.reply('😔 AI вернул пустой ответ. Попробуйте переформулировать запрос.', backToMenuKeyboard());
        }
      } catch (sendErr: any) {
        if (tokensDeducted) await this.refundTokens(userId, actualCost);
        await ctx.reply('😔 Что-то пошло не так.' + (tokensDeducted ? '\n✅ Токены возвращены.' : ''), backToMenuKeyboard());
      }

      if (wasCapped) {
        await ctx.reply('⚠️ Обработаны первые 3 фото. Максимум 3 фото в одном запросе.');
      }

      // Post-response UX: show cost + action buttons
      const updatedUser = await this.prisma.user.findUnique({ where: { id: userId }, select: { balance: true } });
      const remainingBalance = updatedUser?.balance ?? 0;
      const emoji = IMAGE_MODEL_EMOJI[modelId] || '🎨';
      await ctx.reply(
        `${emoji} Сгенерировано в ${model?.displayName ?? modelId}\n💰 Стоимость: ${actualCost.toLocaleString('ru-RU')} токенов. Осталось: ${remainingBalance.toLocaleString('ru-RU')} токенов.`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🎨 Создать ещё', `new_image_${modelId}`)],
          [Markup.button.callback('◀️ В главное меню', 'back_menu')],
        ]),
      );

      // Check first request for referral bonus
      const usageCount = await this.prisma.usage.count({ where: { userId } });
      if (usageCount === 1) {
        await this.referral.applyReferralBonus(userId);
      }
    } catch (err) {
      this.logger.error(`Media group error: user=${group.telegramId}, model=${modelId}`);
      await ctx.reply(MESSAGES.ERROR_GENERAL, { parse_mode: 'HTML', ...backToMenuKeyboard() });
    } finally {
      try { await ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id); } catch {}
    }
  }

  // --- Rate Limiting ---

  private async checkRateLimit(userId: number, ctx: Context): Promise<boolean> {
    const key = `ratelimit:${userId}`;
    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, 60);
    }
    if (current > 10) {
      await ctx.reply(
        '⏳ Слишком много запросов. Подождите минуту.',
        backToMenuKeyboard(),
      );
      return false;
    }
    return true;
  }

  private async checkImageRateLimit(userId: number, ctx: Context): Promise<boolean> {
    const key = `ratelimit:img:${userId}`;
    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.expire(key, 60);
    }
    if (current > 3) {
      await ctx.reply(
        '⏳ Генерация картинок ограничена: максимум 3 в минуту. Подождите.',
        backToMenuKeyboard(),
      );
      return false;
    }
    return true;
  }

  // --- Content Filter ---

  private isBlockedContent(text: string): boolean {
    return this.BLOCKED_PATTERNS.some((pattern) => pattern.test(text));
  }

  // --- Helpers ---

  private async getUserBalance(userId: number): Promise<number> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { balance: true } });
    return user?.balance ?? 0;
  }

  async refundTokens(userId: number, amount: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { balance: { increment: amount } },
    });

    const lastPackage = await this.prisma.tokenPackage.findFirst({
      where: {
        userId,
        tokensUsed: { gt: 0 },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (lastPackage) {
      await this.prisma.tokenPackage.update({
        where: { id: lastPackage.id },
        data: { tokensUsed: { decrement: Math.min(amount, lastPackage.tokensUsed) } },
      });
    }
  }

  async deductTokens(userId: number, cost: number): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Explicit balance check inside transaction
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.balance < cost) {
        return false;
      }

      const packages = await tx.tokenPackage.findMany({
        where: {
          userId,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        orderBy: [
          { type: 'asc' },
          { expiresAt: 'asc' },
          { createdAt: 'asc' },
        ],
      });

      const activePackages = packages.filter((p) => p.tokens - p.tokensUsed > 0);

      let remaining = cost;
      for (const pkg of activePackages) {
        const available = pkg.tokens - pkg.tokensUsed;
        const deduct = Math.min(available, remaining);
        await tx.tokenPackage.update({
          where: { id: pkg.id },
          data: { tokensUsed: { increment: deduct } },
        });
        remaining -= deduct;
        if (remaining <= 0) break;
      }

      if (remaining > 0) return false;

      await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: cost } },
      });

      return true;
    });
  }

  async downloadPhoto(ctx: Context): Promise<Buffer> {
    const photos = (ctx.message as any)?.photo;
    const largest = photos[photos.length - 1];
    const link = await ctx.telegram.getFileLink(largest.file_id);
    const response = await fetch(link.href);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async downloadVoice(ctx: Context): Promise<Buffer> {
    const voice = (ctx.message as any)?.voice ?? (ctx.message as any)?.audio;
    const link = await ctx.telegram.getFileLink(voice.file_id);
    const response = await fetch(link.href);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
