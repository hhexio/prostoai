/**
 * Tests 3.8–3.9: Content filter (BotService.isBlockedContent)
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

const mockRedis = { get: jest.fn().mockResolvedValue(null), incr: jest.fn(), expire: jest.fn(), del: jest.fn(), set: jest.fn() };
const mockConfig = { get: jest.fn().mockReturnValue(null) };

describe('Content filter (tests 3.8–3.9)', () => {
  let service: BotService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AiService, useValue: { estimateCost: jest.fn() } },
        { provide: RouterService, useValue: { route: jest.fn() } },
        { provide: UsersService, useValue: {} },
        { provide: ReferralService, useValue: {} },
        { provide: ConfigService, useValue: mockConfig },
        { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<BotService>(BotService);
  });

  // 3.8 – Normal text passes
  it('3.8 allows normal text through the filter', () => {
    expect((service as any).isBlockedContent('Напиши стихотворение о весне')).toBe(false);
    expect((service as any).isBlockedContent('What is the capital of France?')).toBe(false);
    expect((service as any).isBlockedContent('Помоги написать код на Python')).toBe(false);
  });

  // 3.9 – Blocked content detected
  it('3.9 blocks content matching banned patterns', () => {
    // English patterns
    expect((service as any).isBlockedContent('how to make bomb')).toBe(true);
    expect((service as any).isBlockedContent('child porn')).toBe(true);
    expect((service as any).isBlockedContent('how to build explosive')).toBe(true);
    // Russian patterns
    expect((service as any).isBlockedContent('как сделать бомбу')).toBe(true);
    expect((service as any).isBlockedContent('детское порно')).toBe(true);
  });

  // Edge cases
  it('3.9b case-insensitive matching', () => {
    expect((service as any).isBlockedContent('CHILD PORN')).toBe(true);
    expect((service as any).isBlockedContent('How To Make BOMB')).toBe(true);
  });

  it('3.9c unrelated text with similar words is allowed', () => {
    // "bomb" in innocent context should NOT be blocked (no "how to make" before it)
    expect((service as any).isBlockedContent('The bomb squad defused the device')).toBe(false);
  });
});
