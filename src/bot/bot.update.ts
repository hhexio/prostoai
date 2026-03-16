import {
  Update,
  Start,
  Help,
  Command,
  On,
  Action,
  Ctx,
} from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import { Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { BotService } from './bot.service';
import { UsersService } from '../users/users.service';
import { ReferralService } from '../users/referral.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { BillingService } from '../billing/billing.service';
import { StarsService } from '../billing/stars.service';
import { MESSAGES, MODEL_DESCRIPTIONS } from './messages';
import {
  mainMenuKeyboard,
  chatModelsKeyboard,
  imageModelsKeyboard,
  buyKeyboard,
  buyMethodKeyboard,
  profileKeyboard,
  backToMenuKeyboard,
} from './keyboards';
import { getModel } from '../ai/models.config';
import { ConfigService } from '@nestjs/config';

@Update()
export class BotUpdate {
  private readonly logger = new Logger(BotUpdate.name);

  constructor(
    private readonly botService: BotService,
    private readonly users: UsersService,
    private readonly referral: ReferralService,
    private readonly analytics: AnalyticsService,
    private readonly billing: BillingService,
    private readonly stars: StarsService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  @Start()
  async onStart(@Ctx() ctx: Context) {
    const telegramId = BigInt(ctx.from!.id);
    const payload = (ctx.message as any)?.text?.split(' ')[1];

    const user = await this.users.findOrCreate(
      telegramId,
      ctx.from!.username,
      ctx.from!.first_name,
    );

    // Process referral deep link
    if (payload?.startsWith('ref_')) {
      const refCode = payload.slice(4);
      await this.referral.processReferral(user.id, refCode, ctx);
    }

    // Check if user is new (created within last 5 seconds)
    const isNew = Date.now() - user.createdAt.getTime() < 5000;

    if (isNew) {
      await ctx.reply(MESSAGES.WELCOME_NEW, {
        parse_mode: 'HTML',
        ...mainMenuKeyboard(),
      });
    } else {
      await ctx.reply(MESSAGES.MAIN_MENU(user.balance), {
        parse_mode: 'HTML',
        ...mainMenuKeyboard(),
      });
    }
  }

  @Help()
  async onHelp(@Ctx() ctx: Context) {
    await ctx.reply(MESSAGES.HELP, { parse_mode: 'HTML', ...backToMenuKeyboard() });
  }

  @Command('balance')
  async onBalance(@Ctx() ctx: Context) {
    const telegramId = BigInt(ctx.from!.id);
    const user = await this.users.findOrCreate(telegramId);

    await ctx.reply(
      MESSAGES.BALANCE(user.balance),
      {
        parse_mode: 'HTML',
        ...profileKeyboard(),
      },
    );
  }

  @Command('buy')
  async onBuy(@Ctx() ctx: Context) {
    await ctx.reply(MESSAGES.BUY_PROMPT, {
      parse_mode: 'HTML',
      ...buyKeyboard(),
    });
  }

  @Command('menu')
  async onMenu(@Ctx() ctx: Context) {
    await ctx.reply('🤖 <b>Выберите категорию:</b>', {
      parse_mode: 'HTML',
      ...mainMenuKeyboard(),
    });
  }

  @Command('ref')
  async onRef(@Ctx() ctx: Context) {
    const telegramId = BigInt(ctx.from!.id);
    const user = await this.users.findOrCreate(telegramId);
    const stats = await this.referral.getReferralStats(user.id);
    const botUsername = ctx.botInfo.username;
    const link = `https://t.me/${botUsername}?start=ref_${user.referralCode}`;

    await ctx.reply(MESSAGES.REFERRAL(link, stats.count, stats.earned), {
      parse_mode: 'HTML',
      ...backToMenuKeyboard(),
    });
  }

  @Command('mode')
  async onMode(@Ctx() ctx: Context) {
    const telegramId = BigInt(ctx.from!.id);
    const user = await this.users.findOrCreate(telegramId);

    if (user.selectedModel) {
      await this.users.setSelectedModel(user.id, null);
      await ctx.reply(MESSAGES.AUTO_MODE, { parse_mode: 'HTML', ...backToMenuKeyboard() });
    } else {
      await ctx.reply('🤖 Выберите модель через /menu или отправьте сообщение в авто-режиме.', backToMenuKeyboard());
    }
  }

  @Command('stats')
  async onStats(@Ctx() ctx: Context) {
    const telegramId = BigInt(ctx.from!.id);
    const user = await this.users.findOrCreate(telegramId);
    const isAdmin = await this.users.isAdmin(user.id, telegramId);

    if (isAdmin) {
      const data = await this.analytics.getAdminStats();
      await ctx.reply(MESSAGES.STATS_ADMIN(data), { parse_mode: 'HTML', ...backToMenuKeyboard() });
    } else {
      const data = await this.analytics.getUserStats(user.id);
      await ctx.reply(
        MESSAGES.STATS_USER(
          data.requests,
          data.tokensSpent,
          data.favoriteModel,
          data.daysActive,
          data.referrals,
        ),
        { parse_mode: 'HTML', ...backToMenuKeyboard() },
      );
    }
  }

  @Command('privacy')
  async onPrivacy(@Ctx() ctx: Context) {
    await ctx.reply(MESSAGES.PRIVACY_POLICY, backToMenuKeyboard());
  }

  @Command('terms')
  async onTerms(@Ctx() ctx: Context) {
    await ctx.reply(MESSAGES.TERMS_OF_SERVICE, backToMenuKeyboard());
  }

  @Command('promo')
  async onPromo(@Ctx() ctx: Context) {
    const text = (ctx.message as any)?.text ?? '';
    const code = text.split(' ')[1]?.trim().toUpperCase();

    if (!code || code.length > 50 || !/^[A-ZА-Я0-9_-]+$/.test(code)) {
      await ctx.reply('Введите промокод: /promo ВАШКОД', backToMenuKeyboard());
      return;
    }

    const telegramId = BigInt(ctx.from!.id);
    const user = await this.users.findOrCreate(telegramId);

    const result = await this.users.applyPromoCode(user.id, code);
    if (result.success) {
      await ctx.reply(MESSAGES.PROMO_SUCCESS(result.tokens), { parse_mode: 'HTML', ...backToMenuKeyboard() });
    } else {
      await ctx.reply(MESSAGES.PROMO_INVALID, { parse_mode: 'HTML', ...backToMenuKeyboard() });
    }
  }

  @Command('feedback')
  async onFeedback(@Ctx() ctx: Context) {
    const telegramId = BigInt(ctx.from!.id);
    await this.redis.set(`state:${telegramId}`, 'awaiting_feedback', 'EX', 300);
    await ctx.reply(
      '📝 Напишите ваше сообщение, пожелание или жалобу.\n\nМы обязательно прочитаем и ответим!',
      Markup.inlineKeyboard([[Markup.button.callback('◀️ В главное меню', 'back_menu')]]),
    );
  }

  @Command('reply')
  async onReply(@Ctx() ctx: Context) {
    const adminId = this.config.get('ADMIN_TELEGRAM_ID');
    if (String(ctx.from!.id) !== adminId) return;

    const text = (ctx.message as any)?.text ?? '';
    const parts = text.split(' ');
    const feedbackId = parseInt(parts[1]);
    const replyText = parts.slice(2).join(' ');

    if (!feedbackId || !replyText) {
      await ctx.reply('Формат: /reply <id> <текст ответа>');
      return;
    }

    try {
      const feedback = await this.prisma.feedback.update({
        where: { id: feedbackId },
        data: { reply: replyText, repliedAt: new Date() },
        include: { user: { select: { telegramId: true, id: true } } },
      });
      await ctx.telegram.sendMessage(
        feedback.user.telegramId.toString(),
        `💬 Ответ от команды ProstoAI:\n\n${replyText}`,
        Markup.inlineKeyboard([[Markup.button.callback('◀️ В главное меню', 'back_menu')]]),
      );
      await ctx.reply(`✅ Ответ отправлен пользователю #${feedback.user.id}`);
    } catch (err: any) {
      await ctx.reply(`❌ Не удалось отправить: ${err.message}`);
    }
  }

  // --- Callback Query Handlers ---

  @Action(/^menu_(.+)$/)
  async onMenuCategory(@Ctx() ctx: Context) {
    const match = (ctx as any).match;
    const category = match?.[1];

    let keyboard;
    let infoText;

    switch (category) {
      case 'chat':
        keyboard = chatModelsKeyboard();
        infoText = '💬 <b>Чат-модели:</b>';
        break;
      case 'image':
        keyboard = imageModelsKeyboard();
        infoText = MESSAGES.IMAGE_CATEGORY_INFO;
        break;
      default:
        return;
    }

    await ctx.editMessageText(infoText, {
      parse_mode: 'HTML',
      ...keyboard,
    });
  }

  @Action(/^model_(.+)$/)
  async onModelSelect(@Ctx() ctx: Context) {
    const match = (ctx as any).match;
    const modelId = match?.[1];
    const model = getModel(modelId);
    if (!model) return;

    const telegramId = BigInt(ctx.from!.id);
    const user = await this.users.findOrCreate(telegramId);
    await this.users.setSelectedModel(user.id, modelId);

    const descFn = MODEL_DESCRIPTIONS[modelId];
    const text = descFn ? descFn(user.balance) : MESSAGES.MODEL_SELECTED(model.displayName);
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...backToMenuKeyboard(),
    });
  }

  @Action('profile')
  async onProfile(@Ctx() ctx: Context) {
    const telegramId = BigInt(ctx.from!.id);
    const user = await this.users.findOrCreate(telegramId);

    await ctx.editMessageText(
      MESSAGES.BALANCE(user.balance),
      {
        parse_mode: 'HTML',
        ...profileKeyboard(),
      },
    );
  }

  @Action('buy_tokens')
  async onBuyTokens(@Ctx() ctx: Context) {
    await ctx.editMessageText(MESSAGES.BUY_PROMPT, {
      parse_mode: 'HTML',
      ...buyKeyboard(),
    });
  }

  @Action('referral_link')
  async onReferralLink(@Ctx() ctx: Context) {
    const telegramId = BigInt(ctx.from!.id);
    const user = await this.users.findOrCreate(telegramId);
    const stats = await this.referral.getReferralStats(user.id);
    const botUsername = ctx.botInfo.username;
    const link = `https://t.me/${botUsername}?start=ref_${user.referralCode}`;

    await ctx.editMessageText(MESSAGES.REFERRAL(link, stats.count, stats.earned), {
      parse_mode: 'HTML',
      ...backToMenuKeyboard(),
    });
  }

  @Action('user_stats')
  async onUserStats(@Ctx() ctx: Context) {
    const telegramId = BigInt(ctx.from!.id);
    const user = await this.users.findOrCreate(telegramId);
    const data = await this.analytics.getUserStats(user.id);

    await ctx.editMessageText(
      MESSAGES.STATS_USER(
        data.requests,
        data.tokensSpent,
        data.favoriteModel,
        data.daysActive,
        data.referrals,
      ),
      { parse_mode: 'HTML', ...backToMenuKeyboard() },
    );
  }

  @Action(/^buy_(.+)$/)
  async onBuyPackage(@Ctx() ctx: Context) {
    const match = (ctx as any).match;
    const packageId = match?.[1];
    if (packageId === 'tokens') return; // handled by buy_tokens action

    await ctx.editMessageText('💳 <b>Выберите способ оплаты:</b>', {
      parse_mode: 'HTML',
      ...buyMethodKeyboard(packageId),
    });
  }

  @Action(/^pay_card_(.+)$/)
  async onPayCard(@Ctx() ctx: Context) {
    await ctx.editMessageText(
      '💳 Оплата картой скоро будет доступна!\n\nПока можно приобрести пакеты до 399₽ за Telegram Stars ⭐\nВыберите другой пакет через /buy',
      { parse_mode: 'HTML', ...backToMenuKeyboard() },
    );
  }

  @Action(/^pay_yukassa_(.+)$/)
  async onPayYukassa(@Ctx() ctx: Context) {
    const match = (ctx as any).match;
    const packageId = match?.[1];
    const telegramId = BigInt(ctx.from!.id);
    const user = await this.users.findOrCreate(telegramId);

    await ctx.answerCbQuery('Создаём платёж...');

    try {
      const { Markup } = await import('telegraf');
      const { paymentUrl } = await this.billing.createYukassaPayment(user.id, packageId);
      await ctx.reply('💳 Перейдите по ссылке для оплаты:', {
        ...Markup.inlineKeyboard([
          [Markup.button.url('Оплатить через ЮKassa', paymentUrl)],
          [Markup.button.callback('◀️ В главное меню', 'back_menu')],
        ]),
      });
    } catch {
      await ctx.reply('❌ Не удалось создать платёж. Попробуйте позже.', backToMenuKeyboard());
    }
  }

  @Action(/^pay_stars_(.+)$/)
  async onPayStars(@Ctx() ctx: Context) {
    const match = (ctx as any).match;
    const packageId = match?.[1];
    const telegramId = BigInt(ctx.from!.id);
    const user = await this.users.findOrCreate(telegramId);

    await ctx.answerCbQuery();
    await this.stars.createInvoice(ctx, packageId, user.id);
  }

  @Action(/^new_image_(.+)$/)
  async onNewImage(@Ctx() ctx: Context) {
    const match = (ctx as any).match;
    const modelId = match?.[1];
    const model = getModel(modelId);
    if (!model) return;

    const telegramId = BigInt(ctx.from!.id);
    const user = await this.users.findOrCreate(telegramId);
    await this.users.setSelectedModel(user.id, modelId);

    await ctx.editMessageText(
      `${model.displayName} готов!\n\n💡 Отправьте описание для генерации.`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('◀️ В главное меню', 'back_menu')],
        ]),
      },
    );
  }

  @Action('back_menu')
  async onBackMenu(@Ctx() ctx: Context) {
    const telegramId = BigInt(ctx.from!.id);
    const user = await this.users.findOrCreate(telegramId);

    const text = MESSAGES.MAIN_MENU(user.balance);

    try {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...mainMenuKeyboard(),
      });
    } catch {
      // editMessageText fails if original message had an image
      await ctx.reply(text, {
        parse_mode: 'HTML',
        ...mainMenuKeyboard(),
      });
    }
  }

  // --- Message Handlers ---

  @On('text')
  async onText(@Ctx() ctx: Context) {
    await this.botService.processMessage(ctx, 'text');
  }

  @On('photo')
  async onPhoto(@Ctx() ctx: Context) {
    await this.botService.processMessage(ctx, 'photo');
  }

  @On('voice')
  async onVoice(@Ctx() ctx: Context) {
    await this.botService.processMessage(ctx, 'voice');
  }

  @On('audio')
  async onAudio(@Ctx() ctx: Context) {
    await this.botService.processMessage(ctx, 'audio');
  }

  @On('pre_checkout_query')
  async onPreCheckout(@Ctx() ctx: Context) {
    await (ctx as any).answerPreCheckoutQuery(true);
  }

  @On('successful_payment')
  async onSuccessfulPayment(@Ctx() ctx: Context) {
    const payment = (ctx.message as any)?.successful_payment;
    if (!payment) return;

    try {
      await this.stars.handleSuccessfulPayment(ctx);
    } catch (err) {
      this.logger.error('Error processing successful_payment', err);
    }
  }
}
