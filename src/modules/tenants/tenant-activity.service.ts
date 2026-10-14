import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  resolvePeriodFilter,
  type ActivityPeriod,
  type PeriodFilter,
} from '../../common/period/period.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { serializeBatch } from '../batches/api-serializers';

export type TenantBatchStatusCounts = {
  total: number;
  pending: number;
  processing: number;
  parsed: number;
  validating: number;
  validated: number;
  exported: number;
  error: number;
};

export type TenantClaimStatusCounts = {
  total: number;
  pending: number;
  valid: number;
  warning: number;
  error: number;
};

export type MemberActivityRow = {
  id: number;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  invite_pending: boolean;
  invite_email_status: string | null;
  invite_expires_at: string | null;
  batches_uploaded: number;
  batches_error: number;
  claims_total: number;
  claims_error: number;
  last_upload_at: string | null;
};

@Injectable()
export class TenantActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async requireTenant(tenantId: number) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { _count: { select: { users: true, batchFiles: true } } },
    });
    if (!tenant) throw new NotFoundException('Tenant not found.');
    return tenant;
  }

  async tenantStats(
    tenantId: number,
    filter: PeriodFilter | ActivityPeriod = '30d',
  ) {
    const window = resolvePeriodFilter(
      typeof filter === 'string' ? { period: filter } : filter,
    );
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

    const [companyUsers, batchGroups, claimGroups] = await Promise.all([
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
    ]);

    const batches = emptyBatchStatusCounts();
    let batchTotal = 0;
    for (const row of batchGroups) {
      const count = row._count._all;
      batchTotal += count;
      if (row.status in batches) {
        batches[row.status as keyof TenantBatchStatusCounts] = count;
      }
    }
    batches.total = batchTotal;

    const claims = emptyClaimStatusCounts();
    let claimTotal = 0;
    for (const row of claimGroups) {
      const count = row._count._all;
      claimTotal += count;
      if (row.status in claims) {
        claims[row.status as keyof TenantClaimStatusCounts] = count;
      }
    }
    claims.total = claimTotal;

    return {
      period: window.period,
      period_start: window.period_start,
      period_end: window.period_end,
      batches,
      claims,
      users: { company_user_count: companyUsers },
    };
  }

  async memberActivity(
    tenantId: number,
    filter: PeriodFilter | ActivityPeriod = '30d',
  ): Promise<MemberActivityRow[]> {
    const window = resolvePeriodFilter(
      typeof filter === 'string' ? { period: filter } : filter,
    );
    const [users, pendingInvites, batchRows] = await Promise.all([
      this.prisma.user.findMany({
        where: { tenantId },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      }),
      this.prisma.tenantInvite.findMany({
        where: { tenantId, acceptedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.batchFile.findMany({
        where: {
          tenantId,
          uploadedById: { not: null },
          ...(window.createdAtFilter ? { createdAt: window.createdAtFilter } : {}),
        },
        select: {
          uploadedById: true,
          status: true,
          totalClaims: true,
          errorClaims: true,
          createdAt: true,
        },
      }),
    ]);

    const inviteByEmail = new Map(pendingInvites.map((i) => [i.email, i]));
    const byUser = new Map<
      number,
      {
        batches_uploaded: number;
        batches_error: number;
        claims_total: number;
        claims_error: number;
        last_upload_at: Date | null;
      }
    >();

    for (const batch of batchRows) {
      const userId = batch.uploadedById;
      if (userId == null) continue;
      const current = byUser.get(userId) ?? {
        batches_uploaded: 0,
        batches_error: 0,
        claims_total: 0,
        claims_error: 0,
        last_upload_at: null as Date | null,
      };
      current.batches_uploaded += 1;
      if (batch.status === 'error') current.batches_error += 1;
      current.claims_total += batch.totalClaims;
      current.claims_error += batch.errorClaims;
      if (
        current.last_upload_at == null ||
        batch.createdAt > current.last_upload_at
      ) {
        current.last_upload_at = batch.createdAt;
      }
      byUser.set(userId, current);
    }

    return users.map((u) => {
      const invite = inviteByEmail.get(u.email);
      const stats = byUser.get(u.id);
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        is_active: u.isActive,
        invite_pending: !!invite && !u.isActive,
        invite_email_status: invite?.emailStatus ?? null,
        invite_expires_at: invite?.expiresAt?.toISOString() ?? null,
        batches_uploaded: stats?.batches_uploaded ?? 0,
        batches_error: stats?.batches_error ?? 0,
        claims_total: stats?.claims_total ?? 0,
        claims_error: stats?.claims_error ?? 0,
        last_upload_at: stats?.last_upload_at?.toISOString() ?? null,
      };
    });
  }

  async recentBatches(tenantId: number, limit = 10) {
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

function emptyBatchStatusCounts(): TenantBatchStatusCounts {
  return {
    total: 0,
    pending: 0,
    processing: 0,
    parsed: 0,
    validating: 0,
    validated: 0,
    exported: 0,
    error: 0,
  };
}

function emptyClaimStatusCounts(): TenantClaimStatusCounts {
  return {
    total: 0,
    pending: 0,
    valid: 0,
    warning: 0,
    error: 0,
  };
}
