import { Controller, Post, Body, HttpCode, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Markup } from 'telegraf';
import { BillingService } from './billing.service';
import { YukassaService } from './yukassa.service';

@Controller('api')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly billing: BillingService,
    private readonly yukassa: YukassaService,
    @InjectBot() private readonly bot: Telegraf,
  ) {}

  @Post('yukassa/webhook')
  @HttpCode(200)
  async yukassaWebhook(@Body() body: any) {
    const paymentId = body?.object?.id;

    if (!paymentId) {
      return { error: 'No payment ID' };
    }

    this.logger.log(`YooKassa webhook: ${body?.event}, payment: ${paymentId}`);

    try {
      // Verify payment via API instead of IP whitelist
      const payment = await this.yukassa.getPayment(paymentId);

      if (payment.status === 'succeeded') {
        await this.billing.confirmPayment(paymentId);
      } else if (payment.status === 'canceled') {
        await this.billing.cancelPayment(paymentId);
        const chatId = payment.metadata?.chatId;
        if (chatId) {
          try {
            await this.bot.telegram.sendMessage(
              chatId,
              '❌ Оплата не прошла.\n\nПопробуйте ещё раз или выберите другой способ оплаты.',
              Markup.inlineKeyboard([
                [Markup.button.callback('💎 Купить токены', 'buy_tokens')],
                [Markup.button.callback('◀️ В главное меню', 'back_menu')],
              ]),
            );
          } catch {}
        }
      } else {
        this.logger.log(`Payment ${paymentId} status: ${payment.status}, ignoring`);
      }
    } catch (err) {
      this.logger.error(`Webhook verification failed for ${paymentId}`, err?.message);
    }

    return { status: 'ok' };
  }
}
