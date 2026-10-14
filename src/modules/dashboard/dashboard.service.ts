import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  resolvePeriodFilter,
  type ActivityPeriod,
  type PeriodFilter,
  type PeriodWindow,
} from '../../common/period/period.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isStaffRole } from '../auth/auth.constants';
import { AuthPrincipal } from '../auth/auth.types';
import { serializeBatch } from '../batches/api-serializers';

const BATCH_STATUSES = [
  'pending',
  'processing',
  'parsed',
  'validating',
  'validated',
  'exported',
  'error',
] as const;

const CLAIM_STATUSES = ['pending', 'valid', 'warning', 'error'] as const;

export type { PeriodWindow };

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  resolvePeriod(filter: PeriodFilter | ActivityPeriod = '30d'): PeriodWindow {
    if (typeof filter === 'string') {
      return resolvePeriodFilter({ period: filter });
    }
    return resolvePeriodFilter(filter);
  }

  async staffStats(filter: PeriodFilter | ActivityPeriod = '30d') {
    const window = this.resolvePeriod(filter);
    const batchWhere: Prisma.BatchFileWhereInput = window.createdAtFilter
      ? { createdAt: window.createdAtFilter }
      : {};
    const claimWhere: Prisma.ClaimWhereInput = window.createdAtFilter
      ? { batchFile: { createdAt: window.createdAtFilter } }
      : {};

    const [
      tenantsTotal,
      tenantsActive,
      tenantsSuspended,
      staffUsers,
      tenantUsers,
      batchGroups,
      claimGroups,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: 'active' } }),
      this.prisma.tenant.count({ where: { status: 'suspended' } }),
      this.prisma.user.count({ where: { tenantId: null } }),
      this.prisma.user.count({ where: { tenantId: { not: null } } }),
      this.prisma.batchFile.groupBy({
        by: ['status'],
        where: batchWhere,
        _count: { _all: true },
      }),
      this.prisma.claim.groupBy({
        by: ['status'],
        where: claimWhere,
        _count: { _all: true },
      }),
    ]);

    const batches = emptyBatchStatusCounts();
    let batchTotal = 0;
    for (const row of batchGroups) {
      const count = row._count._all;
      batchTotal += count;
      if (row.status in batches) {
        batches[row.status as keyof typeof batches] = count;
      }
    }
    batches.total = batchTotal;

    const claims = emptyClaimStatusCounts();
    let claimTotal = 0;
    for (const row of claimGroups) {
      const count = row._count._all;
      claimTotal += count;
      if (row.status in claims) {
        claims[row.status as keyof typeof claims] = count;
      }
    }
    claims.total = claimTotal;

    return {
      period: window.period,
      period_start: window.period_start,
      period_end: window.period_end,
      tenants: {
        total: tenantsTotal,
        active: tenantsActive,
        suspended: tenantsSuspended,
      },
      users: {
        total_staff: staffUsers,
        total_tenant_users: tenantUsers,
      },
      batches,
      claims,
    };
  }

  async staffActivity(limit = 10) {
    const take = Math.min(25, Math.max(1, limit));
    const [recentBatches, recentTenants, recentUploadErrors] = await Promise.all([
      this.prisma.batchFile.findMany({
        orderBy: { createdAt: 'desc' },
        take,
        include: {
          tenant: { select: { id: true, name: true, slug: true } },
          _count: { select: { claims: true } },
        },
      }),
      this.prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.ediUploadErrorLog.findMany({
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          tenantId: true,
          originalFilename: true,
          status: true,
          errorType: true,
          createdAt: true,
          tenant: { select: { name: true, slug: true } },
        },
      }),
    ]);

    return {
      recent_batches: recentBatches.map((b) => serializeBatch(b)),
      recent_tenants: recentTenants.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        created_at: t.createdAt.toISOString(),
      })),
      recent_upload_errors: recentUploadErrors.map((e) => ({
        id: e.id,
        tenant_id: e.tenantId,
        tenant_name: e.tenant?.name ?? null,
        tenant_slug: e.tenant?.slug ?? null,
        original_filename: e.originalFilename,
        status: e.status,
        error_type: e.errorType,
        created_at: e.createdAt.toISOString(),
      })),
    };
  }

  async customerStats(
    auth: AuthPrincipal,
    filter: PeriodFilter | ActivityPeriod = '30d',
  ) {
    const tenantId = requireCustomerTenantId(auth);
    const window = this.resolvePeriod(filter);
    const batchWhere: Prisma.BatchFileWhereInput = {
      tenantId,
      ...(window.createdAtFilter ? { createdAt: window.createdAtFilter } : {}),
    };
    const claimWhere: Prisma.ClaimWhereInput = {
      batchFile: {
        tenantId,
        ...(window.createdAtFilter ? { createdAt: window.createdAtFilter } : {}),
      },
    };

    const [companyUsers, batchGroups, claimGroups, tenant] = await Promise.all([
      this.prisma.user.count({ where: { tenantId } }),
      this.prisma.batchFile.groupBy({
        by: ['status'],
        where: batchWhere,
        _count: { _all: true },
      }),
      this.prisma.claim.groupBy({
        by: ['status'],
        where: claimWhere,
        _count: { _all: true },
      }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          subscriptionStatus: true,
        },
      }),
    ]);

    const batches = emptyBatchStatusCounts();
    let batchTotal = 0;
    for (const row of batchGroups) {
      const count = row._count._all;
      batchTotal += count;
      if (row.status in batches) {
        batches[row.status as keyof typeof batches] = count;
      }
    }
    batches.total = batchTotal;

    const claims = emptyClaimStatusCounts();
    let claimTotal = 0;
    for (const row of claimGroups) {
      const count = row._count._all;
      claimTotal += count;
      if (row.status in claims) {
        claims[row.status as keyof typeof claims] = count;
      }
    }
    claims.total = claimTotal;

    return {
      period: window.period,
      period_start: window.period_start,
      period_end: window.period_end,
      tenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            status: tenant.status,
            subscription_status: tenant.subscriptionStatus,
          }
        : null,
      users: { company_user_count: companyUsers },
      batches,
      claims,
    };
  }

  async customerRecentBatches(auth: AuthPrincipal, limit = 10) {
    const tenantId = requireCustomerTenantId(auth);
    const take = Math.min(25, Math.max(1, limit));
    const rows = await this.prisma.batchFile.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        _count: { select: { claims: true } },
      },
    });
    return rows.map((b) => serializeBatch(b));
  }
}

function requireCustomerTenantId(auth: AuthPrincipal): number {
  if (auth.typ !== 'user' || !auth.role || isStaffRole(auth.role)) {
    throw new ForbiddenException('Customer dashboard requires a tenant user.');
  }
  if (auth.tenantId == null || auth.tenantId <= 0) {
    throw new ForbiddenException('Tenant context is required.');
  }
  return auth.tenantId;
}

function emptyBatchStatusCounts() {
  return {
    total: 0,
    pending: 0,
    processing: 0,
    parsed: 0,
    validating: 0,
    validated: 0,
    exported: 0,
    error: 0,
  } satisfies Record<(typeof BATCH_STATUSES)[number] | 'total', number>;
}

function emptyClaimStatusCounts() {
  return {
    total: 0,
    pending: 0,
    valid: 0,
    warning: 0,
    error: 0,
  } satisfies Record<(typeof CLAIM_STATUSES)[number] | 'total', number>;
}
