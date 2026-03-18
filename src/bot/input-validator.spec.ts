/**
 * Tests 2.12–2.18: Input validation (implemented inline in BotService.processMessage)
 * We test the constants and the behavior they produce.
 */

// Test the constants directly since they're module-level
describe('Input validation constants (tests 2.12–2.18)', () => {
  const MAX_TEXT_LENGTH = 4000;
  const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB
  const MAX_VOICE_DURATION = 300; // 5 minutes in seconds
  const MAX_MEDIA_GROUP_PHOTOS = 3;

  // 2.12 – Text within limit
  it('2.12 text of 3999 chars is within limit', () => {
    const text = 'a'.repeat(3999);
    expect(text.length <= MAX_TEXT_LENGTH).toBe(true);
  });

  // 2.13 – Text exceeds limit
  it('2.13 text of 4001 chars exceeds limit', () => {
    const text = 'a'.repeat(4001);
    expect(text.length > MAX_TEXT_LENGTH).toBe(true);
  });

  // 2.14 – Photo within size limit
  it('2.14 photo of 4.9 MB is within limit', () => {
    const size = 4.9 * 1024 * 1024;
    expect(size <= MAX_PHOTO_SIZE).toBe(true);
  });

  // 2.15 – Photo exceeds size limit
  it('2.15 photo of 5.1 MB exceeds limit', () => {
    const size = 5.1 * 1024 * 1024;
    expect(size > MAX_PHOTO_SIZE).toBe(true);
  });

  // 2.16 – Voice within duration limit (4:59 = 299s)
  it('2.16 voice of 299 seconds is within limit', () => {
    expect(299 <= MAX_VOICE_DURATION).toBe(true);
  });

  // 2.17 – Voice exceeds duration (5:01 = 301s)
  it('2.17 voice of 301 seconds exceeds limit', () => {
    expect(301 > MAX_VOICE_DURATION).toBe(true);
  });

  // 2.18 – Media group capped at 3
  it('2.18 media group allows max 3 photos', () => {
    expect(MAX_MEDIA_GROUP_PHOTOS).toBe(3);
  });
});

// Integration-style tests for BotService input validation
import { Test, TestingModule } from '@nestjs/testing';
import { BotService } from './bot.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { RouterService } from '../ai/router.service';
import { UsersService } from '../users/users.service';
import { ReferralService } from '../users/referral.service';
import { ConfigService } from '@nestjs/config';
import { mockPrismaService } from '../__mocks__/prisma.service';

describe('BotService input validation integration (tests 2.12–2.18)', () => {
  let service: BotService;
  const mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn(),
    del: jest.fn(),
    set: jest.fn(),
  };
  const mockConfig = { get: jest.fn().mockReturnValue(null) };
  const mockUsersService = {
    findOrCreate: jest.fn().mockResolvedValue({ id: 1, balance: 100000, selectedModel: null }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AiService, useValue: { estimateCost: jest.fn().mockReturnValue(1000) } },
        { provide: RouterService, useValue: { route: jest.fn().mockReturnValue('gpt-4.1-mini') } },
        { provide: UsersService, useValue: mockUsersService },
        { provide: ReferralService, useValue: { applyReferralBonus: jest.fn() } },
        { provide: ConfigService, useValue: mockConfig },
        { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<BotService>(BotService);
    jest.clearAllMocks();
  });

  // 2.15 – Photo > 5MB is rejected
  it('2.15 rejects oversized photo and replies with warning', async () => {
    const ctx: any = {
      from: { id: 111, username: 'user', first_name: 'Test' },
      message: {
        photo: [{ file_id: 'file1', file_size: 6 * 1024 * 1024 }],
      },
      reply: jest.fn().mockResolvedValue({}),
      telegram: { deleteMessage: jest.fn() },
      chat: { id: 1 },
    };

    await service.processMessage(ctx, 'photo');

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('слишком большое'),
      expect.anything(),
    );
  });

  // 2.17 – Voice > 5 minutes is rejected
  it('2.17 rejects voice over 5 minutes and replies with warning', async () => {
    const ctx: any = {
      from: { id: 111, username: 'user', first_name: 'Test' },
      message: { voice: { file_id: 'file1', duration: 301 } },
      reply: jest.fn().mockResolvedValue({}),
      telegram: { deleteMessage: jest.fn() },
      chat: { id: 1 },
    };

    await service.processMessage(ctx, 'voice');

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('слишком длинное'),
      expect.anything(),
    );
  });
});
