import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { YukassaService } from './yukassa.service';
import { TOKEN_PACKAGES, PackageConfig } from '../bot/keyboards';
import { ConfigService } from '@nestjs/config';
import { MESSAGES } from '../bot/messages';
import { Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly yukassa: YukassaService,
    private readonly config: ConfigService,
    @InjectBot() private readonly bot: Telegraf,
  ) {}

  getPackages(): PackageConfig[] {
    return TOKEN_PACKAGES;
  }

  getPackageById(packageId: string): PackageConfig | undefined {
    return TOKEN_PACKAGES.find((p) => p.id === packageId);
  }

  async createYukassaPayment(
    userId: number,
    packageId: string,
    userEmail?: string,
  ): Promise<{ paymentUrl: string; paymentId: number }> {
    const pkg = this.getPackageById(packageId);
    if (!pkg) throw new Error(`Package not found: ${packageId}`);

    const webhookUrl = this.config.get('WEBHOOK_URL');

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        amount: pkg.priceRub * 100, // kopecks
        tokens: pkg.tokens,
        packageId: pkg.id,
        packageType: pkg.type as any,
        provider: 'YUKASSA',
        status: 'PENDING',
      },
    });

    const yukassaPayment = await this.yukassa.createPayment(
      pkg.priceRub,
      `${pkg.tokens.toLocaleString('ru-RU')} токенов для ProstoAI`,
      `${webhookUrl}/api/yukassa/webhook`,
      { userId, packageId, paymentId: payment.id },
      userEmail,
      pkg.name,
    );

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { externalId: yukassaPayment.id },
    });

    return {
      paymentUrl: yukassaPayment.confirmation.confirmation_url,
      paymentId: payment.id,
    };
  }

  async confirmPayment(externalId: string): Promise<void> {
    const payment = await this.prisma.payment.findUnique({
      where: { externalId },
      include: { user: true },
    });

    if (!payment || payment.status === 'SUCCEEDED') return;

    const expiresAt =
      payment.packageType === 'EXPIRING'
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'SUCCEEDED' },
      });

      await tx.tokenPackage.create({
        data: {
          userId: payment.userId,
          tokens: payment.tokens,
          type: payment.packageType,
          expiresAt,
        },
      });

      await tx.user.update({
        where: { id: payment.userId },
        data: { balance: { increment: payment.tokens } },
      });
    });

    // Find package name for notification
    const packageName = TOKEN_PACKAGES.find((p) => p.tokens === payment.tokens)?.name ?? 'Unknown';

    try {
      await this.bot.telegram.sendMessage(
        Number(payment.user.telegramId),
        MESSAGES.PAYMENT_SUCCESS(payment.tokens, packageName),
        { parse_mode: 'HTML' },
      );
    } catch (e) {
      this.logger.warn(`Could not notify user ${payment.user.telegramId} about payment`);
    }
  }

  async confirmStarsPayment(payload: { packageId: string; userId: number }): Promise<void> {
    const pkg = this.getPackageById(payload.packageId);
    if (!pkg) return;

    const expiresAt =
      pkg.type === 'EXPIRING'
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : null;

    const payment = await this.prisma.payment.create({
      data: {
        userId: payload.userId,
        amount: pkg.priceStars,
        tokens: pkg.tokens,
        packageId: pkg.id,
        packageType: pkg.type as any,
        provider: 'STARS',
        status: 'SUCCEEDED',
      },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.tokenPackage.create({
        data: {
          userId: payload.userId,
          tokens: pkg.tokens,
          type: pkg.type as any,
          expiresAt,
        },
      });

      await tx.user.update({
        where: { id: payload.userId },
        data: { balance: { increment: pkg.tokens } },
      });
    });
  }

  async cancelPayment(externalId: string): Promise<void> {
    await this.prisma.payment.updateMany({
      where: { externalId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
  }

  async handleRefund(externalId: string): Promise<void> {
    await this.prisma.payment.updateMany({
      where: { externalId },
      data: { status: 'REFUNDED' },
    });
  }
}
