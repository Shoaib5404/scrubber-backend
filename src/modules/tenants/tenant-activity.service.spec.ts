import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantActivityService } from './tenant-activity.service';

describe('TenantActivityService', () => {
  let service: TenantActivityService;
  const prisma = {
    tenant: { findUnique: jest.fn() },
    user: { count: jest.fn(), findMany: jest.fn() },
    batchFile: { groupBy: jest.fn(), findMany: jest.fn() },
    claim: { groupBy: jest.fn() },
    tenantInvite: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantActivityService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(TenantActivityService);
  });

  describe('requireTenant', () => {
    it('throws when tenant missing', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      await expect(service.requireTenant(99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('tenantStats', () => {
    it('scopes aggregations to tenantId', async () => {
      prisma.user.count.mockResolvedValue(3);
      prisma.batchFile.groupBy.mockResolvedValue([
        { status: 'validated', _count: { _all: 2 } },
        { status: 'error', _count: { _all: 1 } },
      ]);
      prisma.claim.groupBy.mockResolvedValue([
        { status: 'valid', _count: { _all: 5 } },
      ]);

      const stats = await service.tenantStats(12, '30d');

      expect(prisma.batchFile.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 12 }),
        }),
      );
      expect(prisma.claim.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            batchFile: expect.objectContaining({ tenantId: 12 }),
          }),
        }),
      );
      expect(stats.batches.total).toBe(3);
      expect(stats.batches.error).toBe(1);
      expect(stats.claims.total).toBe(5);
      expect(stats.users.company_user_count).toBe(3);
    });
  });

  describe('memberActivity', () => {
    it('attributes batches only to matching uploadedById within tenant', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 1,
          email: 'a@example.com',
          name: 'Alice',
          role: 'tenant_admin',
          isActive: true,
        },
        {
          id: 2,
          email: 'b@example.com',
          name: 'Bob',
          role: 'customer',
          isActive: true,
        },
      ]);
      prisma.tenantInvite.findMany.mockResolvedValue([]);
      prisma.batchFile.findMany.mockResolvedValue([
        {
          uploadedById: 1,
          status: 'validated',
          totalClaims: 4,
          errorClaims: 0,
          createdAt: new Date('2026-10-01T00:00:00.000Z'),
        },
        {
          uploadedById: 1,
          status: 'error',
          totalClaims: 2,
          errorClaims: 2,
          createdAt: new Date('2026-10-10T00:00:00.000Z'),
        },
        {
          uploadedById: 2,
          status: 'validated',
          totalClaims: 1,
          errorClaims: 0,
          createdAt: new Date('2026-10-05T00:00:00.000Z'),
        },
      ]);

      const rows = await service.memberActivity(12, 'all');

      expect(prisma.batchFile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 12 }),
        }),
      );
      const alice = rows.find((r) => r.id === 1)!;
      const bob = rows.find((r) => r.id === 2)!;
      expect(alice.batches_uploaded).toBe(2);
      expect(alice.batches_error).toBe(1);
      expect(alice.claims_total).toBe(6);
      expect(alice.claims_error).toBe(2);
      expect(alice.last_upload_at).toBe('2026-10-10T00:00:00.000Z');
      expect(bob.batches_uploaded).toBe(1);
      expect(bob.claims_total).toBe(1);
    });

    it('returns zero stats for users with no uploads', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 9,
          email: 'pending@example.com',
          name: 'Pending',
          role: 'customer',
          isActive: false,
        },
      ]);
      prisma.tenantInvite.findMany.mockResolvedValue([
        {
          email: 'pending@example.com',
          emailStatus: 'sent',
          expiresAt: new Date('2026-11-01T00:00:00.000Z'),
        },
      ]);
      prisma.batchFile.findMany.mockResolvedValue([]);

      const rows = await service.memberActivity(12, '30d');
      expect(rows[0].batches_uploaded).toBe(0);
      expect(rows[0].invite_pending).toBe(true);
      expect(rows[0].last_upload_at).toBeNull();
    });
  });
});
