/**
 * Tests 2.7–2.11: Rate limiting (BotService private methods tested via (service as any))
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BotService } from './bot.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { RouterService } from '../ai/router.service';
import { UsersService } from '../users/users.service';
import { ReferralService } from '../users/referral.service';
import { ConfigService } from '@nestjs/config';
import { mockPrismaService } from '../__mocks__/prisma.service';

const makeCtx = (overrides?: any) => ({
  reply: jest.fn().mockResolvedValue({ message_id: 99 }),
  ...overrides,
});

const mockAiService = { estimateCost: jest.fn().mockReturnValue(5000) };
const mockRouterService = { route: jest.fn() };
const mockReferralService = { applyReferralBonus: jest.fn() };
const ADMIN_ID = '669117287';

describe('Rate limiting (tests 2.7–2.11)', () => {
  let service: BotService;
  let mockRedis: any;

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      del: jest.fn(),
      set: jest.fn(),
    };

    const mockConfig = {
      get: jest.fn((key: string) => (key === 'ADMIN_TELEGRAM_ID' ? ADMIN_ID : null)),
    };

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

  // 2.7 – Within limit (count = 6, limit = 10)
  it('2.7 allows request when count is within limit (6 < 10)', async () => {
    mockRedis.incr.mockResolvedValue(6);
    const ctx = makeCtx();

    const allowed = await (service as any).checkRateLimit(1, ctx);

    expect(allowed).toBe(true);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  // 2.8 – Exceeded limit (count = 11)
  it('2.8 blocks request when count exceeds 10', async () => {
    mockRedis.incr.mockResolvedValue(11);
    const ctx = makeCtx();

    const allowed = await (service as any).checkRateLimit(1, ctx);

    expect(allowed).toBe(false);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Слишком много запросов'),
      expect.anything(),
    );
  });

  // 2.9 – Image rate limit: 3 per minute
  it('2.9 blocks 4th image request (limit = 3)', async () => {
    mockRedis.incr.mockResolvedValue(4);
    const ctx = makeCtx();

    const allowed = await (service as any).checkImageRateLimit(1, ctx);

    expect(allowed).toBe(false);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Генерация картинок'),
      expect.anything(),
    );
  });

  // 2.10 – Image rate limit: 3rd request still allowed
  it('2.9b allows 3rd image request', async () => {
    mockRedis.incr.mockResolvedValue(3);
    const ctx = makeCtx();

    const allowed = await (service as any).checkImageRateLimit(1, ctx);

    expect(allowed).toBe(true);
  });

  // 2.11 – On first request, TTL is set to 60 seconds
  it('2.11 sets 60s TTL on first request (counter = 1)', async () => {
    mockRedis.incr.mockResolvedValue(1);
    const ctx = makeCtx();

    await (service as any).checkRateLimit(42, ctx);

    expect(mockRedis.expire).toHaveBeenCalledWith('ratelimit:42', 60);
  });

  it('2.11b does NOT reset TTL on subsequent requests', async () => {
    mockRedis.incr.mockResolvedValue(5);
    const ctx = makeCtx();

    await (service as any).checkRateLimit(42, ctx);

    expect(mockRedis.expire).not.toHaveBeenCalled();
  });
});
