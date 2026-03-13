import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);
  private readonly MAX_REFERRALS = 50;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectBot() private readonly bot: Telegraf<Context>,
  ) {}

  async processReferral(newUserId: number, referralCode: string, ctx?: Context): Promise<boolean> {
    try {
      const referrer = await this.prisma.user.findUnique({ where: { referralCode } });
      if (!referrer) return false;
      if (referrer.id === newUserId) return false;

      // Check if already referred
      const existing = await this.prisma.referral.findUnique({
        where: { referredId: newUserId },
      });
      if (existing) return false;

      // Limit max referrals per user
      const referralCount = await this.prisma.referral.count({
        where: { referrerId: referrer.id },
      });
      if (referralCount >= this.MAX_REFERRALS) {
        this.logger.warn(`Referral limit reached for user ${referrer.id}`);
        return false;
      }

      const bonusTokens = Number(this.config.get('REFERRAL_BONUS', 50000));

      // Create referral record but DON'T give tokens yet (deferred bonus)
      await this.prisma.referral.create({
        data: {
          referrerId: referrer.id,
          referredId: newUserId,
          bonusTokens,
          bonusApplied: false,
        },
      });

      return true;
    } catch (err) {
      this.logger.error('Referral processing error', err);
      return false;
    }
  }

  /** Apply referral bonus after referred user's first successful AI request */
  async applyReferralBonus(userId: number): Promise<void> {
    const referral = await this.prisma.referral.findUnique({
      where: { referredId: userId },
    });

    if (!referral || referral.bonusApplied) return;

    const bonusTokens = referral.bonusTokens;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: referral.referrerId },
        data: { balance: { increment: bonusTokens } },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { balance: { increment: bonusTokens } },
      }),
      this.prisma.tokenPackage.create({
        data: { userId: referral.referrerId, tokens: bonusTokens, tokensUsed: 0, type: 'PERMANENT' },
      }),
      this.prisma.tokenPackage.create({
        data: { userId, tokens: bonusTokens, tokensUsed: 0, type: 'PERMANENT' },
      }),
      this.prisma.referral.update({
        where: { id: referral.id },
        data: { bonusApplied: true },
      }),
    ]);

    // Notify referrer
    try {
      const referrer = await this.prisma.user.findUnique({ where: { id: referral.referrerId } });
      if (referrer) {
        await this.bot.telegram.sendMessage(
          referrer.telegramId.toString(),
          `🎉 Ваш друг воспользовался ботом! Вам начислено ${bonusTokens.toLocaleString('ru-RU')} токенов.`,
        );
      }
    } catch {}
  }

  async getReferralStats(userId: number): Promise<{ count: number; earned: number }> {
    const referrals = await this.prisma.referral.findMany({
      where: { referrerId: userId },
    });
    return {
      count: referrals.length,
      earned: referrals
        .filter((r) => r.bonusApplied)
        .reduce((sum, r) => sum + r.bonusTokens, 0),
    };
  }
}
