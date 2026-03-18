/**
 * Tests 1.8–1.12: Payment processing
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from '../billing/billing.service';
import { YukassaService } from '../billing/yukassa.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { mockPrismaService } from '../__mocks__/prisma.service';

const mockBot = { telegram: { sendMessage: jest.fn().mockResolvedValue({}) } };
const mockYukassa = { createPayment: jest.fn(), getPayment: jest.fn() };
const mockConfig = { get: jest.fn().mockReturnValue(null) };

describe('BillingService – payment processing (tests 1.8–1.12)', () => {
  let service: BillingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: YukassaService, useValue: mockYukassa },
        { provide: ConfigService, useValue: mockConfig },
        { provide: 'DEFAULT_BOT_NAME', useValue: mockBot },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    jest.clearAllMocks();
  });

  // 1.8 – Stars payment, expiring package
  it('1.8 confirmStarsPayment credits expiring tokens with 30-day expiry', async () => {
    mockPrismaService.$transaction.mockImplementation(async (cb: any) => cb(mockPrismaService));
    mockPrismaService.payment.create.mockResolvedValue({ id: 1 });
    mockPrismaService.tokenPackage.create.mockResolvedValue({});
    mockPrismaService.user.update.mockResolvedValue({});

    await service.confirmStarsPayment({ packageId: 'starter', userId: 1 });

    // Payment created with STARS provider and SUCCEEDED
    expect(mockPrismaService.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ provider: 'STARS', status: 'SUCCEEDED', packageType: 'EXPIRING' }),
      }),
    );

    // Token package created with expiresAt set (~30 days)
    expect(mockPrismaService.tokenPackage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 1,
          tokens: 100_000,
          type: 'EXPIRING',
        }),
      }),
    );
    const callData = mockPrismaService.tokenPackage.create.mock.calls[0][0].data;
    expect(callData.expiresAt).toBeInstanceOf(Date);
    const thirtyDaysFromNow = Date.now() + 30 * 24 * 60 * 60 * 1000;
    expect(callData.expiresAt.getTime()).toBeCloseTo(thirtyDaysFromNow, -3);

    // User balance incremented
    expect(mockPrismaService.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { balance: { increment: 100_000 } } }),
    );
  });

  // 1.9 – Permanent package
  it('1.9 confirmStarsPayment credits permanent tokens (no expiry)', async () => {
    mockPrismaService.$transaction.mockImplementation(async (cb: any) => cb(mockPrismaService));
    mockPrismaService.payment.create.mockResolvedValue({ id: 1 });
    mockPrismaService.tokenPackage.create.mockResolvedValue({});
    mockPrismaService.user.update.mockResolvedValue({});

    await service.confirmStarsPayment({ packageId: 'mini', userId: 2 });

    // Token package with no expiresAt
    expect(mockPrismaService.tokenPackage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 2,
          tokens: 50_000,
          type: 'PERMANENT',
          expiresAt: null,
        }),
      }),
    );
  });

  // 1.10 – YooKassa webhook: successful payment
  it('1.10 confirmPayment updates status and credits tokens', async () => {
    mockPrismaService.$transaction.mockImplementation(async (cb: any) => cb(mockPrismaService));
    mockPrismaService.payment.findUnique.mockResolvedValue({
      id: 1,
      userId: 3,
      tokens: 100_000,
      packageType: 'EXPIRING',
      status: 'PENDING',
      user: { telegramId: BigInt('123456789') },
    });
    mockPrismaService.payment.update.mockResolvedValue({});
    mockPrismaService.tokenPackage.create.mockResolvedValue({});
    mockPrismaService.user.update.mockResolvedValue({});

    await service.confirmPayment('ext-id-123');

    expect(mockPrismaService.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'SUCCEEDED' } }),
    );
    expect(mockPrismaService.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { balance: { increment: 100_000 } } }),
    );
  });

  // 1.11 – Duplicate webhook (idempotency)
  it('1.11 confirmPayment ignores already SUCCEEDED payment', async () => {
    mockPrismaService.payment.findUnique.mockResolvedValue({
      id: 1,
      userId: 3,
      tokens: 100_000,
      status: 'SUCCEEDED',
      user: { telegramId: BigInt('123456789') },
    });

    await service.confirmPayment('ext-id-123');

    // No further processing
    expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    expect(mockPrismaService.user.update).not.toHaveBeenCalled();
  });

  // 1.12 – Unknown package
  it('1.12 confirmStarsPayment does nothing for unknown packageId', async () => {
    await service.confirmStarsPayment({ packageId: 'nonexistent', userId: 1 });

    expect(mockPrismaService.payment.create).not.toHaveBeenCalled();
    expect(mockPrismaService.user.update).not.toHaveBeenCalled();
  });
});
