import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthPrincipal } from '../auth/auth.types';
import { TenantActivityService } from './tenant-activity.service';
import { TenantFeaturesService } from './tenant-features.service';
import { TenantOverviewController } from './tenant-overview.controller';

describe('TenantOverviewController', () => {
  let controller: TenantOverviewController;
  const activity = {
    requireTenant: jest.fn(),
    tenantStats: jest.fn(),
    memberActivity: jest.fn(),
    recentBatches: jest.fn(),
  };
  const tenantFeatures = { list: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantOverviewController],
      providers: [
        { provide: TenantActivityService, useValue: activity },
        { provide: TenantFeaturesService, useValue: tenantFeatures },
      ],
    }).compile();
    controller = module.get(TenantOverviewController);
  });

  it('rejects staff principals', async () => {
    const staff: AuthPrincipal = {
      typ: 'user',
      userId: 1,
      tenantId: null,
      role: 'admin',
      scopes: [],
    };
    await expect(controller.overview(staff, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects customer role', async () => {
    const customer: AuthPrincipal = {
      typ: 'user',
      userId: 2,
      tenantId: 12,
      role: 'customer',
      scopes: [],
    };
    await expect(controller.overview(customer, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('scopes overview to auth.tenantId for tenant_admin', async () => {
    const admin: AuthPrincipal = {
      typ: 'user',
      userId: 3,
      tenantId: 12,
      role: 'tenant_admin',
      scopes: [],
    };
    activity.requireTenant.mockResolvedValue({
      id: 12,
      name: 'Riverside',
      slug: 'riverside',
      status: 'active',
      subscriptionStatus: 'active',
    });
    tenantFeatures.list.mockResolvedValue(['web.upload']);
    activity.tenantStats.mockResolvedValue({
      period: '30d',
      period_start: null,
      period_end: 'x',
      batches: { total: 1 },
      claims: { total: 2 },
      users: { company_user_count: 1 },
    });
    activity.memberActivity.mockResolvedValue([]);
    activity.recentBatches.mockResolvedValue([]);

    const res = await controller.overview(admin, { period: '30d' });

    expect(activity.requireTenant).toHaveBeenCalledWith(12);
    expect(activity.tenantStats).toHaveBeenCalledWith(12, {
      period: '30d',
      from: undefined,
      to: undefined,
    });
    expect(activity.memberActivity).toHaveBeenCalledWith(12, {
      period: '30d',
      from: undefined,
      to: undefined,
    });
    expect(res.data.tenant.id).toBe(12);
  });
});
