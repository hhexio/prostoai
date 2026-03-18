/**
 * Tests 3.1–3.4: Referral service
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ReferralService } from '../users/referral.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { mockPrismaService } from '../__mocks__/prisma.service';

const mockBot = { telegram: { sendMessage: jest.fn().mockResolvedValue({}) } };
const mockConfig = { get: jest.fn((key: string) => (key === 'REFERRAL_BONUS' ? '50000' : null)) };

describe('ReferralService (tests 3.1–3.4)', () => {
  let service: ReferralService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfig },
        { provide: 'DEFAULT_BOT_NAME', useValue: mockBot },
      ],
    }).compile();

    service = module.get<ReferralService>(ReferralService);
    jest.clearAllMocks();
  });

  // 3.1 – Successful referral is recorded, bonus NOT applied immediately
  it('3.1 records referral without applying bonus immediately', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 99,
      referralCode: 'REF123',
    });
    mockPrismaService.referral.findUnique.mockResolvedValue(null); // not referred yet
    mockPrismaService.referral.count.mockResolvedValue(0); // below limit
    mockPrismaService.referral.create.mockResolvedValue({ id: 1, bonusApplied: false });

    const result = await service.processReferral(42, 'REF123');

    expect(result).toBe(true);
    expect(mockPrismaService.referral.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bonusApplied: false }),
      }),
    );
    // Bonus NOT applied yet
    expect(mockPrismaService.user.update).not.toHaveBeenCalled();
  });

  // 3.2 – Bonus applied after first AI request
  it('3.2 applyReferralBonus credits tokens on first request', async () => {
    mockPrismaService.$transaction.mockImplementation(async (cb: any) => {
      mockPrismaService.referral.findUnique.mockResolvedValue({
        id: 1,
        referrerId: 99,
        referredId: 42,
        bonusTokens: 50000,
        bonusApplied: false,
      });
      mockPrismaService.user.update.mockResolvedValue({});
      mockPrismaService.tokenPackage.create.mockResolvedValue({});
      mockPrismaService.referral.update.mockResolvedValue({});
      return cb(mockPrismaService);
    });

    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 99,
      telegramId: BigInt('111222333'),
    });

    await service.applyReferralBonus(42);

    // Both referrer and referred user get tokens
    expect(mockPrismaService.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 99 }, data: { balance: { increment: 50000 } } }),
    );
    expect(mockPrismaService.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 42 }, data: { balance: { increment: 50000 } } }),
    );
    // bonusApplied set to true
    expect(mockPrismaService.referral.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { bonusApplied: true } }),
    );
  });

  // 3.2b – Bonus not applied twice
  it('3.2b applyReferralBonus does nothing if bonus already applied', async () => {
    mockPrismaService.$transaction.mockImplementation(async (cb: any) => {
      mockPrismaService.referral.findUnique.mockResolvedValue({
        id: 1,
        bonusApplied: true,
      });
      return cb(mockPrismaService);
    });

    await service.applyReferralBonus(42);

    expect(mockPrismaService.user.update).not.toHaveBeenCalled();
  });

  // 3.3 – Max 50 referrals
  it('3.3 rejects 51st referral when limit is 50', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 99, referralCode: 'REF123' });
    mockPrismaService.referral.findUnique.mockResolvedValue(null);
    mockPrismaService.referral.count.mockResolvedValue(50);

    const result = await service.processReferral(42, 'REF123');

    expect(result).toBe(false);
    expect(mockPrismaService.referral.create).not.toHaveBeenCalled();
  });

  // 3.4 – Self-referral is rejected
  it('3.4 rejects self-referral', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 42, referralCode: 'MYCODE' });

    // newUserId === referrer.id
    const result = await service.processReferral(42, 'MYCODE');

    expect(result).toBe(false);
    expect(mockPrismaService.referral.create).not.toHaveBeenCalled();
  });

  // 3.4b – Non-existent referral code
  it('3.4b returns false for unknown referral code', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);

    const result = await service.processReferral(42, 'BADCODE');

    expect(result).toBe(false);
  });
});
