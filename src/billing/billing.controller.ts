import { Controller, Post, Body, Req, HttpCode } from '@nestjs/common';
import { Request } from 'express';
import { BillingService } from './billing.service';
import { Logger } from '@nestjs/common';

// YooKassa webhook IP whitelist
const YUKASSA_IPS = [
  '185.71.76.',
  '185.71.77.',
  '77.75.153.',
  '77.75.156.11',
  '77.75.156.35',
];

function isAllowedIp(ip: string): boolean {
  return YUKASSA_IPS.some((allowed) => ip.startsWith(allowed));
}

@Controller('api')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(private readonly billing: BillingService) {}

  @Post('yukassa/webhook')
  @HttpCode(200)
  async yukassaWebhook(@Body() body: any, @Req() req: Request) {
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip ?? '';

    if (!isAllowedIp(clientIp)) {
      this.logger.warn(`Blocked YooKassa webhook from IP: ${clientIp}`);
      return { ok: false };
    }

    const eventType = body?.event;
    const externalId = body?.object?.id;

    this.logger.log(`YooKassa webhook: ${eventType}, payment: ${externalId}`);

    try {
      switch (eventType) {
        case 'payment.succeeded':
          await this.billing.confirmPayment(externalId);
          break;
        case 'payment.canceled':
          await this.billing.cancelPayment(externalId);
          break;
        case 'refund.succeeded':
          await this.billing.handleRefund(externalId);
          break;
        default:
          this.logger.log(`Unhandled event type: ${eventType}`);
      }
    } catch (err) {
      this.logger.error(`YooKassa webhook error for ${eventType}`, err);
    }

    return { ok: true };
  }
}
