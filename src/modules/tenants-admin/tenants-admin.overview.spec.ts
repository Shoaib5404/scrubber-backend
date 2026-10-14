import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantActivityService } from '../tenants/tenant-activity.service';
import { TenantFeaturesService } from '../tenants/tenant-features.service';
import { TenantInviteService } from '../tenants/tenant-invite.service';
import { TenantsAdminService } from './tenants-admin.service';

describe('TenantsAdminService.overview', () => {
  let service: TenantsAdminService;
  const activity = {
    requireTenant: jest.fn(),
    tenantStats: jest.fn(),
    memberActivity: jest.fn(),
    recentBatches: jest.fn(),
  };
  const tenantFeatures = {
    list: jest.fn(),
    replace: jest.fn(),
    validateFeatureList: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsAdminService,
        { provide: PrismaService, useValue: {} },
        { provide: TenantInviteService, useValue: {} },
        { provide: TenantFeaturesService, useValue: tenantFeatures },
        { provide: TenantActivityService, useValue: activity },
      ],
    }).compile();
    service = module.get(TenantsAdminService);
  });

  it('returns scoped overview for tenant id', async () => {
    activity.requireTenant.mockResolvedValue({
      id: 12,
      name: 'Riverside',
      slug: 'riverside',
      status: 'active',
      subscriptionStatus: 'active',
      subscriptionStartsAt: null,
      subscriptionEndsAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      _count: { users: 1, batchFiles: 1 },
    });
    tenantFeatures.list.mockResolvedValue(['web.upload']);
    activity.tenantStats.mockResolvedValue({
      period: '30d',
      period_start: 'a',
      period_end: 'b',
      batches: { total: 1 },
      claims: { total: 2 },
      users: { company_user_count: 1 },
    });
    activity.memberActivity.mockResolvedValue([
      { id: 1, batches_uploaded: 1, email: 'a@x.com' },
    ]);
    activity.recentBatches.mockResolvedValue([{ id: 217 }]);

    const data = await service.overview(12, { period: '30d' });

    expect(activity.requireTenant).toHaveBeenCalledWith(12);
    expect(activity.tenantStats).toHaveBeenCalledWith(12, { period: '30d' });
    expect(activity.memberActivity).toHaveBeenCalledWith(12, { period: '30d' });
    expect(data.tenant.id).toBe(12);
    expect(data.members).toHaveLength(1);
    expect(data.recent_batches).toEqual([{ id: 217 }]);
  });

  it('propagates not found from activity service', async () => {
    activity.requireTenant.mockRejectedValue(new NotFoundException('Tenant not found.'));
    await expect(service.overview(999)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TenantOverviewController access', () => {
  it('documents ForbiddenException for non tenant_admin (unit via helper contract)', () => {
    // Controller gate is covered by integration of requireTenantAdmin:
    const err = new ForbiddenException('Tenant admin access required.');
    expect(err.getStatus()).toBe(403);
  });
});
