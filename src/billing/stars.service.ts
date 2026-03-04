import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import { TOKEN_PACKAGES } from '../bot/keyboards';
import { BillingService } from './billing.service';

@Injectable()
export class StarsService {
  private readonly logger = new Logger(StarsService.name);

  constructor(private readonly billingService: BillingService) {}

  async createInvoice(ctx: Context, packageId: string, userId: number): Promise<void> {
    const pkg = TOKEN_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) {
      await ctx.reply('❌ Пакет не найден');
      return;
    }

    const payload = JSON.stringify({ packageId, userId });

    try {
      await ctx.replyWithInvoice({
        title: `ProstoAI — ${pkg.name}`,
        description: `${pkg.tokens.toLocaleString('ru-RU')} токенов${pkg.type === 'EXPIRING' ? ' (30 дней)' : ' (бессрочно)'}`,
        payload,
        currency: 'XTR',
        prices: [{ label: pkg.name, amount: pkg.priceStars }],
      });
    } catch (err) {
      this.logger.error('Stars invoice error', err);
      await ctx.reply('❌ Не удалось выставить счёт. Попробуйте позже.');
    }
  }

  async handleSuccessfulPayment(ctx: Context): Promise<void> {
    const payment = (ctx.message as any)?.successful_payment;
    if (!payment) return;

    try {
      const payload = JSON.parse(payment.invoice_payload) as { packageId: string; userId: number };
      await this.billingService.confirmStarsPayment(payload);

      const pkg = TOKEN_PACKAGES.find((p) => p.id === payload.packageId);
      const packageName = pkg?.name ?? 'Unknown';
      const tokens = pkg?.tokens ?? 0;

      const { MESSAGES } = await import('../bot/messages');
      await ctx.reply(MESSAGES.PAYMENT_SUCCESS(tokens, packageName), { parse_mode: 'HTML' });
    } catch (err) {
      this.logger.error('Stars payment confirmation error', err);
    }
  }
}
