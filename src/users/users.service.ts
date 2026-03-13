import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  private readonly STARTER_BONUS = 15000;

  async findOrCreate(
    telegramId: bigint,
    username?: string,
    firstName?: string,
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { telegramId },
      include: { packages: true },
    });

    if (existing) {
      return this.prisma.user.update({
        where: { telegramId },
        data: {
          username: username ?? undefined,
          firstName: firstName ?? undefined,
        },
        include: { packages: true },
      });
    }

    // Create new user with starter bonus
    const user = await this.prisma.user.create({
      data: {
        telegramId,
        username,
        firstName,
        referralCode: uuidv4(),
        balance: this.STARTER_BONUS,
      },
      include: { packages: true },
    });

    // Create starter token package
    await this.prisma.tokenPackage.create({
      data: {
        userId: user.id,
        tokens: this.STARTER_BONUS,
        tokensUsed: 0,
        type: 'PERMANENT',
      },
    });

    return user;
  }

  async getBalance(userId: number): Promise<{ total: number; expiring: number; permanent: number }> {
    const now = new Date();
    const packages = await this.prisma.tokenPackage.findMany({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    let expiring = 0;
    let permanent = 0;

    for (const pkg of packages) {
      const available = pkg.tokens - pkg.tokensUsed;
      if (available <= 0) continue;
      if (pkg.type === 'EXPIRING') expiring += available;
      else permanent += available;
    }

    return { total: expiring + permanent, expiring, permanent };
  }

  async setSelectedModel(userId: number, modelId: string | null) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { selectedModel: modelId },
    });
  }

  async isAdmin(userId: number, telegramId: bigint): Promise<boolean> {
    const adminId = this.config.get<string>('ADMIN_TELEGRAM_ID');
    if (adminId && BigInt(adminId) === telegramId) return true;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user?.isAdmin ?? false;
  }

  async applyPromoCode(
    userId: number,
    code: string,
  ): Promise<{ success: boolean; tokens: number }> {
    const promo = await this.prisma.promoCode.findUnique({ where: { code } });

    if (!promo) return { success: false, tokens: 0 };
    if (promo.expiresAt && promo.expiresAt < new Date()) return { success: false, tokens: 0 };
    if (promo.usedCount >= promo.maxUses) return { success: false, tokens: 0 };

    // Check if user already used this promo
    const promoKey = `promo:${userId}:${code}`;
    const alreadyUsed = await this.redis.get(promoKey);
    if (alreadyUsed) return { success: false, tokens: 0 };

    await this.prisma.$transaction(async (tx) => {
      await tx.tokenPackage.create({
        data: {
          userId,
          tokens: promo.tokens,
          type: 'PERMANENT',
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: { balance: { increment: promo.tokens } },
      });
      await tx.promoCode.update({
        where: { id: promo.id },
        data: { usedCount: { increment: 1 } },
      });
    });

    // Mark as used in Redis permanently
    await this.redis.set(promoKey, '1');

    return { success: true, tokens: promo.tokens };
  }
}
