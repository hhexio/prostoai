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
