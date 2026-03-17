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

  async createPayment(
    amountRub: number,
    description: string,
    metadata: Record<string, any>,
    packageName?: string,
  ): Promise<any> {
    const amountStr = amountRub.toFixed(2);
    const body: any = {
      amount: { value: amountStr, currency: 'RUB' },
      confirmation: { type: 'redirect', return_url: 'https://t.me/my_prostoai_bot' },
      capture: true,
      description,
      metadata,
      receipt: {
        customer: { email: 'receipt@prostoai.ru' },
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
      },
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${YUKASSA_API}/payments`, body, {
          headers: {
            'Idempotence-Key': uuidv4(),
            'Content-Type': 'application/json',
          },
          auth: {
            username: this.config.get('YUKASSA_SHOP_ID') || '',
            password: this.config.get('YUKASSA_SECRET_KEY') || '',
          },
          timeout: 30000,
        }),
      );
      return response.data;
    } catch (err) {
      this.logger.error('YooKassa createPayment error', { status: err?.response?.status, message: err?.message });
      throw new Error('YUKASSA_ERROR');
    }
  }

  async getPayment(paymentId: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${YUKASSA_API}/payments/${paymentId}`, {
          auth: {
            username: this.config.get('YUKASSA_SHOP_ID') || '',
            password: this.config.get('YUKASSA_SECRET_KEY') || '',
          },
        }),
      );
      return response.data;
    } catch (err) {
      this.logger.error('YooKassa getPayment error', { status: err?.response?.status, message: err?.message });
      throw new Error('YUKASSA_ERROR');
    }
  }
}
