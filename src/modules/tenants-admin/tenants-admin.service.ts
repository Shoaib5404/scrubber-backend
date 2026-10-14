import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ActivityPeriod,
  PeriodFilter,
} from '../../common/period/period.util';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditCategoryCode } from '../audit/audit.catalog';
import { AuditService } from '../audit/audit.service';
import { TenantActivityService } from '../tenants/tenant-activity.service';
import { ALL_TENANT_FEATURES, TENANT_FEATURE_CATALOG } from '../tenants/tenant-features.constants';
import { TenantFeaturesService } from '../tenants/tenant-features.service';
import { TenantInviteService } from '../tenants/tenant-invite.service';
import {
  CreateTenantDto,
  InviteTenantUserDto,
  ListTenantsQueryDto,
  ResendInviteDto,
  UpdateTenantDto,
  UpdateTenantUserDto,
} from './tenants-admin.dto';

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base.length > 0 ? base : 'tenant';
}

function serializeTenant(
  t: {
    id: number;
    name: string;
    slug: string;
    status: string;
    subscriptionStatus: string;
    subscriptionStartsAt: Date | null;
    subscriptionEndsAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    _count?: { users: number; batchFiles: number };
  },
  features: string[] = [],
) {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    status: t.status,
    subscription_status: t.subscriptionStatus,
    subscription_starts_at: t.subscriptionStartsAt?.toISOString() ?? null,
    subscription_ends_at: t.subscriptionEndsAt?.toISOString() ?? null,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
    users_count: t._count?.users ?? undefined,
    batches_count: t._count?.batchFiles ?? undefined,
    features,
  };
}

@Injectable()
export class TenantsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invites: TenantInviteService,
    private readonly tenantFeatures: TenantFeaturesService,
    private readonly activity: TenantActivityService,
    private readonly audit: AuditService,
  ) {}

  featureCatalog() {
    return TENANT_FEATURE_CATALOG;
  }

  async list(query: ListTenantsQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const perPage = Math.min(100, Math.max(1, query.per_page ?? 15));
    const where: Prisma.TenantWhereInput = {};
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: { _count: { select: { users: true, batchFiles: true } } },
      }),
    ]);

    const featuresByTenant = await this.featuresMap(rows.map((r) => r.id));

    return {
      current_page: page,
      per_page: perPage,
      total,
      last_page: Math.max(1, Math.ceil(total / perPage)),
      data: rows.map((r) => serializeTenant(r, featuresByTenant.get(r.id) ?? [])),
    };
  }

  async show(id: number) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { _count: { select: { users: true, batchFiles: true } } },
    });
    if (!tenant) throw new NotFoundException('Tenant not found.');
    const features = await this.tenantFeatures.list(id);
    return serializeTenant(tenant, features);
  }

  async overview(id: number, filter: PeriodFilter | ActivityPeriod = '30d') {
    const tenant = await this.activity.requireTenant(id);
    const features = await this.tenantFeatures.list(id);
    const [stats, members, recent_batches] = await Promise.all([
      this.activity.tenantStats(id, filter),
      this.activity.memberActivity(id, filter),
      this.activity.recentBatches(id, 10),
    ]);
    return {
      tenant: serializeTenant(tenant, features),
      period: stats.period,
      period_start: stats.period_start,
      period_end: stats.period_end,
      stats: {
        batches: stats.batches,
        claims: stats.claims,
        users: stats.users,
      },
      members,
      recent_batches,
    };
  }

  async create(dto: CreateTenantDto, actorUserId: number | null) {
    const name = dto.name.trim();
    const baseSlug = slugify(dto.slug?.trim() || name);
    let slug = baseSlug;
    let n = 0;
    while (await this.prisma.tenant.findUnique({ where: { slug } })) {
      n += 1;
      slug = `${baseSlug}-${n}`;
    }

    const subscriptionStatus = dto.subscription_status ?? 'inactive';
    const tenant = await this.prisma.tenant.create({
      data: {
        name,
        slug,
        status: 'active',
        subscriptionStatus,
        subscriptionStartsAt: subscriptionStatus === 'active' ? new Date() : null,
      },
    });

    const featureSet =
      dto.features != null
        ? this.tenantFeatures.validateFeatureList(dto.features)
        : [...ALL_TENANT_FEATURES];
    const features = await this.tenantFeatures.replace(tenant.id, featureSet);

    let invite: Awaited<ReturnType<TenantInviteService['inviteUser']>> | null = null;
    if (dto.admin_email) {
      invite = await this.invites.inviteUser({
        tenantId: tenant.id,
        email: dto.admin_email,
        name: dto.admin_name ?? dto.admin_email.split('@')[0] ?? 'Admin',
        role: 'tenant_admin',
        invitedByUserId: actorUserId,
      });
    }

    this.audit.record({
      category: AuditCategoryCode.AdminTenantCreate,
      action: 'created',
      resourceType: 'tenant',
      resourceId: tenant.id,
      tenantId: tenant.id,
      metadata: {
        slug: tenant.slug,
        subscription_status: subscriptionStatus,
        features,
      },
    });

    return {
      tenant: serializeTenant(
        { ...tenant, _count: { users: invite ? 1 : 0, batchFiles: 0 } },
        features,
      ),
      invite,
    };
  }

  async update(id: number, dto: UpdateTenantDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found.');

    const data: Prisma.TenantUpdateInput = {};
    if (dto.name != null) data.name = dto.name.trim();
    if (dto.status != null) data.status = dto.status;
    if (dto.subscription_status != null) {
      data.subscriptionStatus = dto.subscription_status;
      if (dto.subscription_status === 'active' && !tenant.subscriptionStartsAt) {
        data.subscriptionStartsAt = new Date();
      }
    }

    const updated = await this.prisma.tenant.update({
      where: { id },
      data,
      include: { _count: { select: { users: true, batchFiles: true } } },
    });

    if (dto.subscription_status != null) {
      await this.prisma.user.updateMany({
        where: { tenantId: id, role: { in: ['customer', 'tenant_admin'] } },
        data: { subscriptionStatus: dto.subscription_status },
      });
    }

    const features =
      dto.features != null
        ? await this.tenantFeatures.replace(id, dto.features)
        : await this.tenantFeatures.list(id);

    this.audit.record({
      category: AuditCategoryCode.AdminTenantUpdate,
      action: 'updated',
      resourceType: 'tenant',
      resourceId: id,
      tenantId: id,
      metadata: {
        status: updated.status,
        subscription_status: updated.subscriptionStatus,
        features_changed: dto.features != null,
      },
    });

    return serializeTenant(updated, features);
  }

  private async featuresMap(tenantIds: number[]): Promise<Map<number, string[]>> {
    const map = new Map<number, string[]>();
    if (tenantIds.length === 0) return map;
    const rows = await this.prisma.tenantFeature.findMany({
      where: { tenantId: { in: tenantIds }, enabled: true },
      select: { tenantId: true, feature: true },
      orderBy: { feature: 'asc' },
    });
    for (const row of rows) {
      const list = map.get(row.tenantId) ?? [];
      list.push(row.feature);
      map.set(row.tenantId, list);
    }
    return map;
  }

  async listUsers(tenantId: number) {
    await this.requireTenant(tenantId);
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      orderBy: { id: 'asc' },
    });
    const pendingInvites = await this.prisma.tenantInvite.findMany({
      where: { tenantId, acceptedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const inviteByEmail = new Map(pendingInvites.map((i) => [i.email, i]));

    return users.map((u) => {
      const invite = inviteByEmail.get(u.email);
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        is_active: u.isActive,
        invite_pending: !!invite && !u.isActive,
        invite_email_status: invite?.emailStatus ?? null,
        invite_expires_at: invite?.expiresAt?.toISOString() ?? null,
      };
    });
  }

  async inviteUser(tenantId: number, dto: InviteTenantUserDto, actorUserId: number | null) {
    await this.requireTenant(tenantId);
    return this.invites.inviteUser({
      tenantId,
      email: dto.email,
      name: dto.name,
      role: dto.role,
      invitedByUserId: actorUserId,
    });
  }

  async resendInvite(tenantId: number, dto: ResendInviteDto, actorUserId: number | null) {
    await this.requireTenant(tenantId);
    return this.invites.resendInvite({
      tenantId,
      email: dto.email,
      invitedByUserId: actorUserId,
    });
  }

  async updateUser(tenantId: number, userId: number, dto: UpdateTenantUserDto) {
    await this.requireTenant(tenantId);
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
    });
    if (!user) throw new NotFoundException('User not found.');

    if (dto.role == null && dto.is_active == null) {
      throw new BadRequestException('No changes provided.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.role != null ? { role: dto.role } : {}),
        ...(dto.is_active != null ? { isActive: dto.is_active } : {}),
      },
    });

    this.audit.record({
      category: AuditCategoryCode.AdminMemberUpdate,
      action: 'updated',
      resourceType: 'user',
      resourceId: updated.id,
      tenantId,
      metadata: {
        role: updated.role,
        is_active: updated.isActive,
        previous_role: user.role,
        previous_is_active: user.isActive,
      },
    });

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      is_active: updated.isActive,
    };
  }

  private async requireTenant(id: number) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found.');
    return tenant;
  }
}
