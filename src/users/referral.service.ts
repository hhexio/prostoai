import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Context } from 'telegraf';
import { MESSAGES } from '../bot/messages';

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async processReferral(newUserId: number, referralCode: string, ctx?: Context): Promise<boolean> {
    try {
      const referrer = await this.prisma.user.findUnique({ where: { referralCode } });
      if (!referrer) return false;
      if (referrer.id === newUserId) return false; // Cannot refer yourself

      // Check if already referred
      const existing = await this.prisma.referral.findUnique({
        where: { referredId: newUserId },
      });
      if (existing) return false;

      const bonusTokens = Number(this.config.get('REFERRAL_BONUS', 50000));

      await this.prisma.$transaction(async (tx) => {
        // Create referral record
        await tx.referral.create({
          data: {
            referrerId: referrer.id,
            referredId: newUserId,
            bonusTokens,
          },
        });

        // Give tokens to referrer
        await tx.tokenPackage.create({
          data: {
            userId: referrer.id,
            tokens: bonusTokens,
            type: 'PERMANENT',
          },
        });
        await tx.user.update({
          where: { id: referrer.id },
          data: { balance: { increment: bonusTokens } },
        });

        // Give tokens to new user
        await tx.tokenPackage.create({
          data: {
            userId: newUserId,
            tokens: bonusTokens,
            type: 'PERMANENT',
          },
        });
        await tx.user.update({
          where: { id: newUserId },
          data: { balance: { increment: bonusTokens } },
        });
      });

      // Notify referrer
      if (ctx) {
        try {
          await ctx.telegram.sendMessage(
            Number(referrer.telegramId),
            MESSAGES.REFERRAL_BONUS(bonusTokens),
            { parse_mode: 'HTML' },
          );
        } catch (e) {
          this.logger.warn(`Could not notify referrer ${referrer.telegramId}`);
        }
      }

      return true;
    } catch (err) {
      this.logger.error('Referral processing error', err);
      return false;
    }
  }

  async getReferralStats(userId: number): Promise<{ count: number; earned: number }> {
    const referrals = await this.prisma.referral.findMany({
      where: { referrerId: userId },
    });
    return {
      count: referrals.length,
      earned: referrals.reduce((sum, r) => sum + r.bonusTokens, 0),
    };
  }
}
