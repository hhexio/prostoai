/**
 * Tests 3.5–3.7: Starter bonus (UsersService.findOrCreate)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { mockPrismaService } from '../__mocks__/prisma.service';

const mockRedis = { get: jest.fn(), set: jest.fn(), incr: jest.fn(), expire: jest.fn() };
const mockConfig = { get: jest.fn().mockReturnValue(null) };

describe('UsersService – starter bonus (tests 3.5–3.7)', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: 'default_IORedisModuleConnectionToken', useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  // 3.5 – New user gets 15,000 tokens
  it('3.5 creates new user with 15,000 starter tokens', async () => {
    const telegramId = BigInt('555123456');

    // No existing user
    mockPrismaService.user.findUnique.mockResolvedValue(null);
    mockPrismaService.user.create.mockResolvedValue({
      id: 1,
      telegramId,
      balance: 15000,
      packages: [],
    });
    mockPrismaService.tokenPackage.create.mockResolvedValue({});

    await service.findOrCreate(telegramId, 'testuser', 'Test');

    expect(mockPrismaService.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ balance: 15000, telegramId }),
      }),
    );
    expect(mockPrismaService.tokenPackage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tokens: 15000, type: 'PERMANENT' }),
      }),
    );
  });

  // 3.6 – Returning user: no bonus
  it('3.6 returning user gets no additional bonus', async () => {
    const telegramId = BigInt('555123456');

    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 1,
      telegramId,
      balance: 10000,
      packages: [],
    });
    mockPrismaService.user.update.mockResolvedValue({ id: 1, telegramId, balance: 10000, packages: [] });

    await service.findOrCreate(telegramId, 'testuser', 'Test');

    // create should NOT be called
    expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    // tokenPackage create should NOT be called
    expect(mockPrismaService.tokenPackage.create).not.toHaveBeenCalled();
  });

  // 3.7 – Protection: same telegramId always returns same user (upsert-like behavior)
  it('3.7 same telegramId does not create a second user', async () => {
    const telegramId = BigInt('777654321');
    const existingUser = { id: 5, telegramId, balance: 5000, packages: [] };

    mockPrismaService.user.findUnique.mockResolvedValue(existingUser);
    mockPrismaService.user.update.mockResolvedValue(existingUser);

    // Call twice
    await service.findOrCreate(telegramId);
    await service.findOrCreate(telegramId);

    expect(mockPrismaService.user.create).not.toHaveBeenCalled();
  });
});
