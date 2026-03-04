import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

const YUKASSA_API = 'https://api.yookassa.ru/v3';

@Injectable()
export class YukassaService {
  private readonly logger = new Logger(YukassaService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  private get auth() {
    const shopId = this.config.get('YUKASSA_SHOP_ID');
    const secretKey = this.config.get('YUKASSA_SECRET_KEY');
    return Buffer.from(`${shopId}:${secretKey}`).toString('base64');
  }

  async createPayment(
    amountRub: number,
    description: string,
    returnUrl: string,
    metadata: Record<string, any>,
    customerEmail?: string,
    packageName?: string,
  ): Promise<any> {
    const amountStr = amountRub.toFixed(2);
    const body: any = {
      amount: { value: amountStr, currency: 'RUB' },
      confirmation: { type: 'redirect', return_url: returnUrl },
      capture: true,
      description,
      metadata,
    };

    if (customerEmail) {
      body.receipt = {
        customer: { email: customerEmail },
        items: [
          {
            description: packageName ?? description,
            quantity: '1.00',
            amount: { value: amountStr, currency: 'RUB' },
            vat_code: 1,
            payment_subject: 'service',
            payment_mode: 'full_payment',
          },
        ],
      };
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${YUKASSA_API}/payments`, body, {
          headers: {
            Authorization: `Basic ${this.auth}`,
            'Idempotence-Key': uuidv4(),
            'Content-Type': 'application/json',
          },
        }),
      );
      return response.data;
    } catch (err) {
      this.logger.error('YooKassa createPayment error', err?.response?.data);
      throw new Error('YUKASSA_ERROR');
    }
  }

  async getPayment(paymentId: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${YUKASSA_API}/payments/${paymentId}`, {
          headers: { Authorization: `Basic ${this.auth}` },
        }),
      );
      return response.data;
    } catch (err) {
      this.logger.error('YooKassa getPayment error', err?.response?.data);
      throw new Error('YUKASSA_ERROR');
    }
  }
}
