import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private checkAuth(token: string) {
    const adminToken = this.config.get('ADMIN_SECRET');
    if (!token || token !== adminToken) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  @Get('stats')
  async getStats(@Query('token') token: string) {
    this.checkAuth(token);

    const totalUsers = await this.prisma.user.count();
    const activeToday = await this.prisma.usage.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    });
    const totalRequests = await this.prisma.usage.count();
    const totalRevenue = await this.prisma.payment.aggregate({
      _sum: { amount: true },
    });

    const modelStats = await this.prisma.usage.groupBy({
      by: ['model'],
      _count: { id: true },
      _sum: { balanceCost: true },
      orderBy: { _count: { id: 'desc' } },
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newUsersRaw = await this.prisma.$queryRaw`
      SELECT DATE("createdAt") as date, COUNT(*)::int as count
      FROM "User"
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date DESC
    `;
    const requestsPerDay = await this.prisma.$queryRaw`
      SELECT DATE("createdAt") as date, COUNT(*)::int as count
      FROM "Usage"
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date DESC
    `;
    const paymentsPerDay = await this.prisma.$queryRaw`
      SELECT DATE("createdAt") as date, COUNT(*)::int as count, COALESCE(SUM(amount), 0)::int as total
      FROM "Payment"
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date DESC
    `;

    return {
      overview: {
        totalUsers,
        activeToday: activeToday.length,
        totalRequests,
        totalRevenue: totalRevenue._sum.amount || 0,
      },
      modelStats,
      newUsersPerDay: newUsersRaw,
      requestsPerDay,
      paymentsPerDay,
    };
  }

  @Get('feedback')
  async getFeedback(@Query('token') token: string) {
    this.checkAuth(token);

    return this.prisma.feedback.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, username: true, firstName: true, telegramId: true } },
      },
    });
  }

  @Get('metrics')
  async getMetrics(@Query('token') token: string) {
    this.checkAuth(token);

    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const totalUsers = await this.prisma.user.count();
    const activeUsers = await this.prisma.user.count({ where: { usages: { some: {} } } });
    const payingUsers = await this.prisma.user.count({ where: { payments: { some: {} } } });

    const registrationToActive = totalUsers > 0 ? (activeUsers / totalUsers * 100).toFixed(1) : '0';
    const activeToPaying = activeUsers > 0 ? (payingUsers / activeUsers * 100).toFixed(1) : '0';
    const registrationToPaying = totalUsers > 0 ? (payingUsers / totalUsers * 100).toFixed(1) : '0';

    const totalRevenue = await this.prisma.payment.aggregate({ _sum: { amount: true }, _count: true });
    const revenue7d = await this.prisma.payment.aggregate({ _sum: { amount: true }, _count: true, where: { createdAt: { gte: sevenDaysAgo } } });
    const revenue30d = await this.prisma.payment.aggregate({ _sum: { amount: true }, _count: true, where: { createdAt: { gte: thirtyDaysAgo } } });

    const avgCheck = totalRevenue._count > 0 ? Math.round((totalRevenue._sum.amount || 0) / totalRevenue._count) : 0;
    const arpu = totalUsers > 0 ? Math.round((totalRevenue._sum.amount || 0) / totalUsers) : 0;
    const arppu = payingUsers > 0 ? Math.round((totalRevenue._sum.amount || 0) / payingUsers) : 0;
    const ltv = arppu;

    const activeToday = (await this.prisma.usage.groupBy({ by: ['userId'], where: { createdAt: { gte: today } } })).length;
    const active7d = (await this.prisma.usage.groupBy({ by: ['userId'], where: { createdAt: { gte: sevenDaysAgo } } })).length;
    const active30d = (await this.prisma.usage.groupBy({ by: ['userId'], where: { createdAt: { gte: thirtyDaysAgo } } })).length;

    const usersWithMultipleDays = await this.prisma.$queryRaw`
      SELECT COUNT(DISTINCT "userId")::int as count
      FROM (
        SELECT "userId", COUNT(DISTINCT DATE("createdAt")) as days
        FROM "Usage"
        GROUP BY "userId"
        HAVING COUNT(DISTINCT DATE("createdAt")) > 1
      ) sub
    `;
    const retention = activeUsers > 0
      ? ((usersWithMultipleDays as any)[0]?.count / activeUsers * 100).toFixed(1)
      : '0';

    const packageStats = await this.prisma.payment.groupBy({
      by: ['packageId'],
      _count: { id: true },
      _sum: { amount: true },
      orderBy: { _count: { id: 'desc' } },
    });

    const totalRequests = await this.prisma.usage.count();
    const avgRequestsPerUser = activeUsers > 0 ? (totalRequests / activeUsers).toFixed(1) : '0';

    const dailyRevenue = await this.prisma.$queryRaw`
      SELECT DATE("createdAt") as date,
             COUNT(*)::int as transactions,
             COALESCE(SUM(amount), 0)::int as revenue
      FROM "Payment"
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date DESC
    `;

    const dailyActive = await this.prisma.$queryRaw`
      SELECT DATE("createdAt") as date,
             COUNT(DISTINCT "userId")::int as users
      FROM "Usage"
      WHERE "createdAt" >= ${thirtyDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date DESC
    `;

    return {
      funnel: { totalUsers, activeUsers, payingUsers, registrationToActive: `${registrationToActive}%`, activeToPaying: `${activeToPaying}%`, registrationToPaying: `${registrationToPaying}%` },
      revenue: { total: totalRevenue._sum.amount || 0, totalTransactions: totalRevenue._count, last7d: revenue7d._sum.amount || 0, last7dTransactions: revenue7d._count, last30d: revenue30d._sum.amount || 0, last30dTransactions: revenue30d._count, avgCheck },
      unit: { arpu, arppu, ltv, avgRequestsPerUser },
      activity: { activeToday, active7d, active30d, retention: `${retention}%` },
      packageStats,
      dailyRevenue,
      dailyActive,
    };
  }

  @Get('users')
  async getUsers(@Query('token') token: string, @Query('page') page: string) {
    this.checkAuth(token);
    const pageNum = parseInt(page) || 1;
    const perPage = 50;

    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        username: true,
        firstName: true,
        balance: true,
        createdAt: true,
        _count: { select: { usages: true } },
      },
    });

    const total = await this.prisma.user.count();
    return { users, total, page: pageNum, perPage };
  }
}
