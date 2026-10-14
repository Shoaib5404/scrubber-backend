import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isStaffRole, isTenantRole } from '../auth/auth.constants';
import type { AuthPrincipal } from '../auth/auth.types';
import { PLATFORM_ONLY_AUDIT_CATEGORIES } from './audit.catalog';

export type ListAuditEventsQuery = {
  page?: number;
  per_page?: number;
  category?: string;
  action?: string;
  tenant_id?: number;
  actor_user_id?: number;
  resource_type?: string;
  resource_id?: string;
  from?: string;
  to?: string;
};

@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(auth: AuthPrincipal, query: ListAuditEventsQuery) {
    const page = query.page ?? 1;
    const perPage = Math.min(query.per_page ?? 25, 100);

    const staff =
      auth.typ === 'user' && !!auth.role && isStaffRole(auth.role);
    const customer =
      auth.typ === 'user' &&
      !!auth.role &&
      isTenantRole(auth.role) &&
      auth.tenantId != null;

    if (!staff && !customer) {
      throw new ForbiddenException('Not allowed to view audit events.');
    }

    const where: Prisma.AuditEventWhereInput = {};

    if (staff) {
      if (query.tenant_id != null) {
        where.tenantId = query.tenant_id;
      }
    } else {
      // Customer: force tenant scope; hide platform-only categories.
      where.tenantId = auth.tenantId!;
      where.categoryCode = { notIn: [...PLATFORM_ONLY_AUDIT_CATEGORIES] };
    }

    if (query.category?.trim()) {
      const code = query.category.trim();
      if (!staff && PLATFORM_ONLY_AUDIT_CATEGORIES.has(code)) {
        return this.emptyPage(page, perPage);
      }
      where.categoryCode = code;
    }

    if (query.action?.trim()) {
      where.action = query.action.trim();
    }
    if (query.actor_user_id != null) {
      where.actorUserId = query.actor_user_id;
    }
    if (query.resource_type?.trim()) {
      where.resourceType = query.resource_type.trim();
    }
    if (query.resource_id?.trim()) {
      where.resourceId = query.resource_id.trim();
    }

    const occurredAt: Prisma.DateTimeFilter = {};
    if (query.from) {
      const from = new Date(query.from);
      if (!Number.isNaN(from.getTime())) occurredAt.gte = from;
    }
    if (query.to) {
      const to = new Date(query.to);
      if (!Number.isNaN(to.getTime())) occurredAt.lte = to;
    }
    if (Object.keys(occurredAt).length > 0) {
      where.occurredAt = occurredAt;
    }

    const [total, rows] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where,
        include: {
          actorUser: { select: { id: true, name: true, email: true } },
          tenant: { select: { id: true, name: true, slug: true } },
          category: { select: { code: true, label: true, group: true } },
        },
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    return {
      current_page: page,
      per_page: perPage,
      total,
      last_page: Math.max(1, Math.ceil(total / perPage)),
      data: rows.map((r) => ({
        id: r.id,
        occurred_at: r.occurredAt.toISOString(),
        category_code: r.categoryCode,
        category_label: r.category.label,
        category_group: r.category.group,
        action: r.action,
        actor_type: r.actorType,
        actor_user_id: r.actorUserId,
        actor_api_client_id: r.actorApiClientId,
        actor_role: r.actorRole,
        actor_user: r.actorUser
          ? {
              id: r.actorUser.id,
              name: r.actorUser.name,
              email: r.actorUser.email,
            }
          : null,
        tenant_id: r.tenantId,
        tenant: r.tenant
          ? { id: r.tenant.id, name: r.tenant.name, slug: r.tenant.slug }
          : null,
        resource_type: r.resourceType,
        resource_id: r.resourceId,
        request_id: r.requestId,
        ip: r.ip,
        metadata: r.metadata,
      })),
    };
  }

  private emptyPage(page: number, perPage: number) {
    return {
      current_page: page,
      per_page: perPage,
      total: 0,
      last_page: 1,
      data: [] as unknown[],
    };
  }
}
