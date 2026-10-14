import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthPrincipal } from '../auth/auth.types';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  const prisma = {
    tenant: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    user: { count: jest.fn() },
    batchFile: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    claim: { groupBy: jest.fn() },
    ediUploadErrorLog: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(DashboardService);
  });

  describe('resolvePeriod', () => {
    it('defaults to 30d window with start bound', () => {
      const window = service.resolvePeriod('30d');
      expect(window.period).toBe('30d');
      expect(window.period_start).toBeTruthy();
      expect(window.createdAtFilter?.gte).toBeInstanceOf(Date);
    });

    it('returns unbounded filter for all', () => {
      const window = service.resolvePeriod('all');
      expect(window.period_start).toBeNull();
      expect(window.createdAtFilter).toBeUndefined();
    });
  });

  describe('staffStats', () => {
    it('aggregates platform totals across tenants', async () => {
      prisma.tenant.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(1);
      prisma.user.count.mockResolvedValueOnce(3).mockResolvedValueOnce(12);
      prisma.batchFile.groupBy.mockResolvedValue([
        { status: 'validated', _count: { _all: 8 } },
        { status: 'error', _count: { _all: 2 } },
      ]);
      prisma.claim.groupBy.mockResolvedValue([
        { status: 'valid', _count: { _all: 40 } },
        { status: 'error', _count: { _all: 5 } },
      ]);

      const stats = await service.staffStats('30d');

      expect(stats.tenants).toEqual({ total: 5, active: 4, suspended: 1 });
      expect(stats.users).toEqual({
        total_staff: 3,
        total_tenant_users: 12,
      });
      expect(stats.batches.total).toBe(10);
      expect(stats.batches.validated).toBe(8);
      expect(stats.batches.error).toBe(2);
      expect(stats.claims.total).toBe(45);
      expect(stats.claims.valid).toBe(40);
      expect(stats.claims.error).toBe(5);
    });
  });

  describe('customerStats', () => {
    const tenantAuth: AuthPrincipal = {
      typ: 'user',
      userId: 10,
      tenantId: 42,
      role: 'tenant_admin',
      scopes: [],
    };

    it('scopes aggregations to auth.tenantId', async () => {
      prisma.user.count.mockResolvedValue(4);
      prisma.batchFile.groupBy.mockResolvedValue([
        { status: 'error', _count: { _all: 1 } },
      ]);
      prisma.claim.groupBy.mockResolvedValue([
        { status: 'warning', _count: { _all: 3 } },
      ]);
      prisma.tenant.findUnique.mockResolvedValue({
        id: 42,
        name: 'Acme',
        slug: 'acme',
        status: 'active',
        subscriptionStatus: 'active',
      });

      const stats = await service.customerStats(tenantAuth, '7d');

      expect(prisma.batchFile.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 42 }),
        }),
      );
      expect(prisma.claim.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            batchFile: expect.objectContaining({ tenantId: 42 }),
          }),
        }),
      );
      expect(stats.users.company_user_count).toBe(4);
      expect(stats.batches.error).toBe(1);
      expect(stats.tenant?.slug).toBe('acme');
    });

    it('rejects staff principals', async () => {
      const staff: AuthPrincipal = {
        typ: 'user',
        userId: 1,
        tenantId: null,
        role: 'admin',
        scopes: [],
      };
      await expect(service.customerStats(staff)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects tenant users without tenantId', async () => {
      const orphan: AuthPrincipal = {
        typ: 'user',
        userId: 11,
        tenantId: null,
        role: 'customer',
        scopes: [],
      };
      await expect(service.customerStats(orphan)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('customerRecentBatches', () => {
    it('never queries another tenant even if limit is large', async () => {
      prisma.batchFile.findMany.mockResolvedValue([]);
      const auth: AuthPrincipal = {
        typ: 'user',
        userId: 10,
        tenantId: 7,
        role: 'customer',
        scopes: [],
      };

      await service.customerRecentBatches(auth, 100);

      expect(prisma.batchFile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 7 },
          take: 25,
        }),
      );
    });
  });
});
