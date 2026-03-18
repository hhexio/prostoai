/**
 * Tests 1.1–1.7: Token deduction logic
 * deductTokens() lives in BotService; getBalance() lives in UsersService.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BotService } from '../bot/bot.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { RouterService } from '../ai/router.service';
import { ReferralService } from '../users/referral.service';
import { ConfigService } from '@nestjs/config';
import { mockPrismaService } from '../__mocks__/prisma.service';

// Minimal stubs for services not under test
const mockAiService = { estimateCost: jest.fn().mockReturnValue(5000), chat: jest.fn(), generateImage: jest.fn() };
const mockRouterService = { route: jest.fn().mockReturnValue('gpt-4o') };
const mockReferralService = { applyReferralBonus: jest.fn() };
const mockRedis = { get: jest.fn().mockResolvedValue(null), incr: jest.fn().mockResolvedValue(1), expire: jest.fn(), del: jest.fn(), set: jest.fn() };
const mockConfig = { get: jest.fn().mockReturnValue(null) };

describe('Token deduction (BotService.deductTokens)', () => {
  let service: BotService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AiService, useValue: mockAiService },
        { provide: RouterService, useValue: mockRouterService },
        { provide: UsersService, useValue: {} },
        { provide: ReferralService, useValue: mockReferralService },
        { provide: ConfigService, useValue: mockConfig },
        { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<BotService>(BotService);
    jest.clearAllMocks();
  });

  // 1.1 – Successful deduction
  it('1.1 deducts tokens when balance is sufficient', async () => {
    mockPrismaService.$transaction.mockImplementation(async (cb: any) => cb(mockPrismaService));
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 1, balance: 10000 });
    mockPrismaService.tokenPackage.findMany.mockResolvedValue([
      { id: 10, tokens: 10000, tokensUsed: 0, type: 'PERMANENT', expiresAt: null },
    ]);
    mockPrismaService.tokenPackage.update.mockResolvedValue({});
    mockPrismaService.user.update.mockResolvedValue({ balance: 5000 });

    const result = await service.deductTokens(1, 5000);

    expect(result).toBe(true);
    expect(mockPrismaService.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { balance: { decrement: 5000 } } }),
    );
  });

  // 1.2 – Insufficient balance
  it('1.2 returns false when balance is insufficient', async () => {
    mockPrismaService.$transaction.mockImplementation(async (cb: any) => cb(mockPrismaService));
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 1, balance: 1000 });

    const result = await service.deductTokens(1, 5000);

    expect(result).toBe(false);
    expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    expect(mockPrismaService.tokenPackage.update).not.toHaveBeenCalled();
  });

  // 1.3 – Uses $transaction
  it('1.3 deduction runs inside a Prisma transaction', async () => {
    mockPrismaService.$transaction.mockImplementation(async (cb: any) => cb(mockPrismaService));
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 1, balance: 10000 });
    mockPrismaService.tokenPackage.findMany.mockResolvedValue([
      { id: 10, tokens: 10000, tokensUsed: 0, type: 'PERMANENT', expiresAt: null },
    ]);
    mockPrismaService.tokenPackage.update.mockResolvedValue({});
    mockPrismaService.user.update.mockResolvedValue({});

    await service.deductTokens(1, 5000);

    expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
  });

  // 1.4 – Race condition: second transaction sees insufficient balance
  it('1.4 rejects second concurrent deduction when balance is drained', async () => {
    let callCount = 0;
    mockPrismaService.$transaction.mockImplementation(async (cb: any) => {
      callCount++;
      // First call: balance 6000, deduct 5000 → success
      // Second call: balance is now 1000 (simulated), deduct 5000 → fail
      if (callCount === 1) {
        mockPrismaService.user.findUnique.mockResolvedValueOnce({ id: 1, balance: 6000 });
        mockPrismaService.tokenPackage.findMany.mockResolvedValueOnce([
          { id: 10, tokens: 10000, tokensUsed: 0, type: 'PERMANENT', expiresAt: null },
        ]);
        mockPrismaService.tokenPackage.update.mockResolvedValue({});
        mockPrismaService.user.update.mockResolvedValue({});
        return cb(mockPrismaService);
      } else {
        mockPrismaService.user.findUnique.mockResolvedValueOnce({ id: 1, balance: 1000 });
        return cb(mockPrismaService);
      }
    });

    const [first, second] = await Promise.all([
      service.deductTokens(1, 5000),
      service.deductTokens(1, 5000),
    ]);

    const successCount = [first, second].filter(Boolean).length;
    expect(successCount).toBe(1);
  });

  // 1.5 – Expiring tokens deducted first (EXPIRING sorts before PERMANENT)
  it('1.5 deducts from expiring package first', async () => {
    mockPrismaService.$transaction.mockImplementation(async (cb: any) => cb(mockPrismaService));
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 1, balance: 13000 });

    const expiryDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const expiringPkg = { id: 1, tokens: 3000, tokensUsed: 0, type: 'EXPIRING', expiresAt: expiryDate };
    const permanentPkg = { id: 2, tokens: 10000, tokensUsed: 0, type: 'PERMANENT', expiresAt: null };

    // EXPIRING sorts before PERMANENT (asc by type: 'E' < 'P')
    mockPrismaService.tokenPackage.findMany.mockResolvedValue([expiringPkg, permanentPkg]);
    mockPrismaService.tokenPackage.update.mockResolvedValue({});
    mockPrismaService.user.update.mockResolvedValue({});

    await service.deductTokens(1, 2000);

    // Should have updated the expiring package, not the permanent one
    expect(mockPrismaService.tokenPackage.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { tokensUsed: { increment: 2000 } } }),
    );
    // Permanent package should NOT be touched
    expect(mockPrismaService.tokenPackage.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 2 } }),
    );
  });

  // 1.6 – Span across two packages when first runs out
  it('1.6 spans deduction across expiring and permanent packages', async () => {
    mockPrismaService.$transaction.mockImplementation(async (cb: any) => cb(mockPrismaService));
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 1, balance: 11000 });

    const expiryDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
    const expiringPkg = { id: 1, tokens: 1000, tokensUsed: 0, type: 'EXPIRING', expiresAt: expiryDate };
    const permanentPkg = { id: 2, tokens: 10000, tokensUsed: 0, type: 'PERMANENT', expiresAt: null };

    mockPrismaService.tokenPackage.findMany.mockResolvedValue([expiringPkg, permanentPkg]);
    mockPrismaService.tokenPackage.update.mockResolvedValue({});
    mockPrismaService.user.update.mockResolvedValue({});

    const result = await service.deductTokens(1, 3000);

    expect(result).toBe(true);
    // Expiring: deduct 1000 (all of it)
    expect(mockPrismaService.tokenPackage.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { tokensUsed: { increment: 1000 } } }),
    );
    // Permanent: deduct remaining 2000
    expect(mockPrismaService.tokenPackage.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 2 }, data: { tokensUsed: { increment: 2000 } } }),
    );
  });

  // 1.7 – Expired packages not counted
  it('1.7 does not deduct from expired packages', async () => {
    mockPrismaService.$transaction.mockImplementation(async (cb: any) => cb(mockPrismaService));
    // User's balance field = 2000 (only permanent counts, expiring expired)
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 1, balance: 2000 });

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // DB query already filters expired, so findMany returns only permanent
    const permanentPkg = { id: 2, tokens: 2000, tokensUsed: 0, type: 'PERMANENT', expiresAt: null };
    mockPrismaService.tokenPackage.findMany.mockResolvedValue([permanentPkg]);
    mockPrismaService.tokenPackage.update.mockResolvedValue({});
    mockPrismaService.user.update.mockResolvedValue({});

    const result = await service.deductTokens(1, 1500);

    expect(result).toBe(true);
    expect(mockPrismaService.tokenPackage.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 2 }, data: { tokensUsed: { increment: 1500 } } }),
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// UsersService.getBalance — balance breakdown tests
// ────────────────────────────────────────────────────────────────────────────
describe('UsersService.getBalance', () => {
  let usersService: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    usersService = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  it('returns 0 for all categories when no packages', async () => {
    mockPrismaService.tokenPackage.findMany.mockResolvedValue([]);
    const balance = await usersService.getBalance(1);
    expect(balance).toEqual({ total: 0, expiring: 0, permanent: 0 });
  });

  it('correctly sums expiring and permanent balances', async () => {
    const expiryDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    mockPrismaService.tokenPackage.findMany.mockResolvedValue([
      { id: 1, tokens: 3000, tokensUsed: 0, type: 'EXPIRING', expiresAt: expiryDate },
      { id: 2, tokens: 10000, tokensUsed: 2000, type: 'PERMANENT', expiresAt: null },
    ]);
    const balance = await usersService.getBalance(1);
    expect(balance.expiring).toBe(3000);
    expect(balance.permanent).toBe(8000);
    expect(balance.total).toBe(11000);
  });
});
