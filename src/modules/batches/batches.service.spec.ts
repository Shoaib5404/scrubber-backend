import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from '../../adapters/storage/storage.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BatchesService } from './batches.service';

describe('BatchesService.list', () => {
  let service: BatchesService;
  const prisma = {
    batchFile: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.batchFile.count.mockResolvedValue(0);
    prisma.batchFile.findMany.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchesService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: {} },
      ],
    }).compile();
    service = module.get(BatchesService);
  });

  it('scopes customer lists to auth tenantId and ignores filterTenantId', async () => {
    await service.list({
      ownerUserId: 9,
      tenantId: 3,
      staff: false,
      filterTenantId: 999,
    });

    expect(prisma.batchFile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 3 }),
      }),
    );
    const where = prisma.batchFile.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe(3);
  });

  it('applies staff filterTenantId when provided', async () => {
    await service.list({
      ownerUserId: 1,
      tenantId: null,
      staff: true,
      filterTenantId: 5,
    });

    expect(prisma.batchFile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 5 }),
      }),
    );
  });

  it('lists all tenants for staff when filterTenantId is omitted', async () => {
    await service.list({
      ownerUserId: 1,
      tenantId: null,
      staff: true,
    });

    const where = prisma.batchFile.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBeUndefined();
  });
});
