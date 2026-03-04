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

  async findOrCreate(
    telegramId: bigint,
    username?: string,
    firstName?: string,
  ) {
    return this.prisma.user.upsert({
      where: { telegramId },
      create: {
        telegramId,
        username,
        firstName,
        referralCode: uuidv4(),
      },
      update: {
        username: username ?? undefined,
        firstName: firstName ?? undefined,
      },
      include: { packages: true },
    });
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
