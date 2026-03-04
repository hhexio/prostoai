import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Cron } from '@nestjs/schedule';
import { Logger } from '@nestjs/common';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getUserStats(userId: number) {
    const usages = await this.prisma.usage.findMany({ where: { userId } });
    const requests = usages.length;
    const tokensSpent = usages.reduce((sum, u) => sum + u.balanceCost, 0);

    // Most used model
    const modelCounts: Record<string, number> = {};
    for (const u of usages) {
      modelCounts[u.model] = (modelCounts[u.model] ?? 0) + 1;
    }
    const favoriteModel =
      Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';

    // Days active
    const days = new Set(usages.map((u) => u.createdAt.toISOString().split('T')[0]));

    const referrals = await this.prisma.referral.count({ where: { referrerId: userId } });

    return {
      requests,
      tokensSpent,
      favoriteModel,
      daysActive: days.size,
      referrals,
    };
  }

  async getAdminStats() {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);

    const startOfMonth = new Date(now);
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      newUsersToday,
      activeTodayGroups,
      activeWeekGroups,
      activeMonthGroups,
      revenueTotal,
      revenueToday,
      revenueMonth,
      requestsToday,
      topModels,
      freeToday,
      paidToday,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: startOfDay } } }),
      this.prisma.usage.groupBy({ by: ['userId'], where: { createdAt: { gte: startOfDay } } }),
      this.prisma.usage.groupBy({ by: ['userId'], where: { createdAt: { gte: startOfWeek } } }),
      this.prisma.usage.groupBy({ by: ['userId'], where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: 'SUCCEEDED' },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: 'SUCCEEDED', createdAt: { gte: startOfDay } },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: 'SUCCEEDED', createdAt: { gte: startOfMonth } },
      }),
      this.prisma.usage.count({ where: { createdAt: { gte: startOfDay } } }),
      this.prisma.usage.groupBy({
        by: ['model'],
        _count: { model: true },
        orderBy: { _count: { model: 'desc' } },
        take: 5,
      }),
      this.prisma.usage.count({ where: { createdAt: { gte: startOfDay }, isFree: true } }),
      this.prisma.usage.count({ where: { createdAt: { gte: startOfDay }, isFree: false } }),
    ]);

    const freeRatio =
      requestsToday > 0 ? Math.round((freeToday / requestsToday) * 100) : 0;

    return {
      totalUsers,
      newUsersToday,
      activeToday: activeTodayGroups.length,
      activeWeek: activeWeekGroups.length,
      activeMonth: activeMonthGroups.length,
      revenueTotal: revenueTotal._sum.amount ?? 0,
      revenueToday: revenueToday._sum.amount ?? 0,
      revenueMonth: revenueMonth._sum.amount ?? 0,
      requestsToday,
      topModels: topModels.map((m) => ({ model: m.model, count: m._count.model })),
      freeRatio,
    };
  }

  @Cron('0 3 * * *')
  async cleanExpiredPackages() {
    this.logger.log('Running expired packages cleanup...');

    const expired = await this.prisma.tokenPackage.findMany({
      where: {
        type: 'EXPIRING',
        expiresAt: { lt: new Date() },
      },
    });

    let cleaned = 0;
    for (const pkg of expired) {
      const unusedTokens = pkg.tokens - pkg.tokensUsed;
      if (unusedTokens <= 0) continue;

      await this.prisma.$transaction([
        this.prisma.tokenPackage.update({
          where: { id: pkg.id },
          data: { tokensUsed: pkg.tokens },
        }),
        this.prisma.user.update({
          where: { id: pkg.userId },
          data: { balance: { decrement: unusedTokens } },
        }),
      ]);
      cleaned++;
    }

    this.logger.log(`Cleaned ${cleaned} expired packages`);
  }
}
