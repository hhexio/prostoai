import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { Context } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { RouterService } from '../ai/router.service';
import { UsersService } from '../users/users.service';
import { getModel } from '../ai/models.config';
import { MESSAGES } from './messages';
import { buyKeyboard } from './keyboards';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly router: RouterService,
    private readonly users: UsersService,
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

    const messageText = type === 'text' ? (ctx.message as any)?.text : undefined;

    // Determine model
    const modelId = user.selectedModel ?? this.router.route(type, messageText);
    const model = getModel(modelId);
    const isImageModel = model?.category === 'image';
    const limitType = isImageModel ? 'image' : 'text';

    // Estimate cost
    const estimatedCost = this.ai.estimateCost(modelId);

    // Fix: Check free limit FIRST, then balance
    let isFree = false;
    if (model?.isFree) {
      const freeCheck = await this.checkFreeLimit(user.id, limitType);
      if (freeCheck.allowed) {
        isFree = true;
      } else {
        // Free limit exhausted, fall through to balance check
        if (user.balance < estimatedCost) {
          await ctx.reply(MESSAGES.NO_BALANCE, {
            parse_mode: 'HTML',
            ...buyKeyboard(),
          });
          return;
        }
      }
    } else {
      // Not a free model — check balance
      if (user.balance < estimatedCost) {
        await ctx.reply(MESSAGES.NO_BALANCE, {
          parse_mode: 'HTML',
          ...buyKeyboard(),
        });
        return;
      }
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

    // Call AI
    let aiResponse;
    try {
      if (type === 'photo' && model?.endpoint === 'google') {
        // Nano Banana 2 image editing: photo + caption
        const photoBuffer = await this.downloadPhoto(ctx);
        const imageBase64 = photoBuffer.toString('base64');
        const caption = (ctx.message as any)?.caption || 'Edit this image';
        aiResponse = await this.ai.generateImageGemini(modelId, caption, imageBase64);
      } else if (type === 'photo') {
        const photoBuffer = await this.downloadPhoto(ctx);
        const base64 = photoBuffer.toString('base64');
        const caption = (ctx.message as any)?.caption;
        aiResponse = await this.ai.analyzePhoto(modelId, base64, caption);
      } else if (type === 'voice' || type === 'audio') {
        const audioBuffer = await this.downloadVoice(ctx);
        aiResponse = await this.ai.transcribeAudio(audioBuffer);
        // After transcription, send text response too
        if (aiResponse.audioText) {
          const textResponse = await this.ai.chat(
            user.selectedModel ?? 'gpt-4.1-mini',
            aiResponse.audioText,
          );
          aiResponse.text = `📝 <b>Расшифровка:</b> ${aiResponse.audioText}\n\n💬 <b>Ответ:</b> ${textResponse.text}`;
          aiResponse.totalCost += textResponse.totalCost;
          aiResponse.inputTokens += textResponse.inputTokens;
          aiResponse.outputTokens += textResponse.outputTokens;
        }
      } else if (isImageModel && model?.endpoint === 'google') {
        aiResponse = await this.ai.generateImageGemini(modelId, messageText);
      } else if (isImageModel) {
        aiResponse = await this.ai.generateImage(modelId, messageText);
      } else {
        aiResponse = await this.ai.chat(modelId, messageText);
      }
    } catch (err) {
      let errorMsg = MESSAGES.ERROR_GENERAL;
      if (err.message === 'TIMEOUT') errorMsg = MESSAGES.ERROR_TIMEOUT;
      else if (err.message === 'RATE_LIMIT') errorMsg = MESSAGES.ERROR_RATE_LIMIT;
      else if (err.message === 'SERVICE_UNAVAILABLE') errorMsg = MESSAGES.ERROR_SERVICE;
      await ctx.reply(errorMsg, { parse_mode: 'HTML' });
      try { await ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id); } catch {}
      return;
    }

    // Deduct tokens (if not free)
    const actualCost = aiResponse.totalCost;
    if (!isFree) {
      await this.deductTokens(user.id, actualCost);
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
        isFree,
      },
    });

    // Send response with 413 handling
    try {
      if (aiResponse.imageBuffer) {
        await ctx.replyWithPhoto({ source: aiResponse.imageBuffer });
      } else if (aiResponse.imageUrl) {
        await ctx.replyWithPhoto({ url: aiResponse.imageUrl });
      } else if (aiResponse.text) {
        await ctx.reply(aiResponse.text, { parse_mode: 'HTML' });
      }
    } catch (err) {
      if (err.message?.includes('413') || err.message?.includes('Too Large')) {
        // Try sending as document instead
        if (aiResponse.imageBuffer) {
          await ctx.replyWithDocument({ source: aiResponse.imageBuffer, filename: 'image.png' });
        } else {
          await ctx.reply('Image was generated but is too large to send. Try a simpler prompt.');
        }
      } else {
        throw err;
      }
    }

    // Delete status message
    try { await ctx.telegram.deleteMessage(ctx.chat!.id, statusMsg.message_id); } catch {}

    // Free hint
    if (isFree) {
      const remaining = await this.getFreeRemaining(user.id, limitType);
      if (remaining <= 3) {
        await ctx.reply(MESSAGES.FREE_HINT(remaining, limitType), { parse_mode: 'HTML' });
      }
    }
  }

  async checkFreeLimit(
    userId: number,
    type: 'text' | 'image',
  ): Promise<{ allowed: boolean; remaining: number }> {
    const today = new Date().toISOString().split('T')[0];
    const key = type === 'text' ? `free:${userId}:${today}` : `freeimg:${userId}:${today}`;
    const limit = type === 'text'
      ? Number(this.config.get('FREE_TEXT_LIMIT', 10))
      : Number(this.config.get('FREE_IMAGE_LIMIT', 2));

    const current = await this.redis.incr(key);
    if (current === 1) {
      const secondsLeft = this.secondsUntilMidnight();
      await this.redis.expire(key, secondsLeft);
    }

    if (current > limit) {
      await this.redis.decr(key);
      return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: limit - current };
  }

  async getFreeRemaining(userId: number, type: 'text' | 'image'): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const key = type === 'text' ? `free:${userId}:${today}` : `freeimg:${userId}:${today}`;
    const limit = type === 'text'
      ? Number(this.config.get('FREE_TEXT_LIMIT', 10))
      : Number(this.config.get('FREE_IMAGE_LIMIT', 2));
    const used = Number(await this.redis.get(key) ?? 0);
    return Math.max(0, limit - used);
  }

  async deductTokens(userId: number, cost: number): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
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

  private secondsUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    return Math.floor((midnight.getTime() - now.getTime()) / 1000);
  }
}
