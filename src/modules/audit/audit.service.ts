import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthPrincipal } from '../auth/auth.types';
import {
  ALL_AUDIT_CATEGORY_CODES,
  AUDIT_CATEGORY_CATALOG,
  RETIRED_AUDIT_CATEGORY_CODES,
  type AuditCategoryCodeValue,
} from './audit.catalog';
import { getAuditContext } from './audit.context';

const ENABLED_CACHE_TTL_MS = 5_000;
const MAX_METADATA_JSON_BYTES = 4_096;

export type AuditActorType = 'user' | 'api_client' | 'system';

export type AuditRecordInput = {
  category: AuditCategoryCodeValue | string;
  action: string;
  actorType?: AuditActorType;
  actorUserId?: number | null;
  actorApiClientId?: number | null;
  actorRole?: string | null;
  tenantId?: number | null;
  resourceType?: string | null;
  resourceId?: string | number | null;
  metadata?: Record<string, unknown> | null;
  /** When true, skip AsyncLocalStorage auth defaults. */
  system?: boolean;
};

@Injectable()
export class AuditService implements OnModuleInit {
  private readonly logger = new Logger(AuditService.name);
  private enabledCache = new Map<string, boolean>();
  private enabledCacheExpiresAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureCategoriesSeeded();
  }

  async ensureCategoriesSeeded(): Promise<void> {
    for (const meta of AUDIT_CATEGORY_CATALOG) {
      await this.prisma.auditCategory.upsert({
        where: { code: meta.code },
        create: {
          code: meta.code,
          label: meta.label,
          description: meta.description,
          group: meta.group,
          enabled: meta.enabledByDefault,
        },
        update: {
          label: meta.label,
          description: meta.description,
          group: meta.group,
        },
      });
    }

    // Keep historical events, but disable retired categories and hide them from settings.
    if (RETIRED_AUDIT_CATEGORY_CODES.length > 0) {
      await this.prisma.auditCategory.updateMany({
        where: { code: { in: [...RETIRED_AUDIT_CATEGORY_CODES] } },
        data: { enabled: false },
      });
      this.invalidateEnabledCache();
    }
  }

  invalidateEnabledCache(): void {
    this.enabledCache.clear();
    this.enabledCacheExpiresAt = 0;
  }

  async isEnabled(code: string): Promise<boolean> {
    const now = Date.now();
    if (now < this.enabledCacheExpiresAt && this.enabledCache.has(code)) {
      return this.enabledCache.get(code)!;
    }

    if (now >= this.enabledCacheExpiresAt) {
      const rows = await this.prisma.auditCategory.findMany({
        select: { code: true, enabled: true },
      });
      this.enabledCache = new Map(rows.map((r) => [r.code, r.enabled]));
      this.enabledCacheExpiresAt = now + ENABLED_CACHE_TTL_MS;
    }

    return this.enabledCache.get(code) ?? false;
  }

  /**
   * Fail-open: never throws to callers. No-ops when category disabled.
   */
  record(input: AuditRecordInput): void {
    void this.recordAsync(input).catch((err: unknown) => {
      this.logger.warn(
        `Audit write failed for ${input.category}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }

  async recordAsync(input: AuditRecordInput): Promise<void> {
    if ((RETIRED_AUDIT_CATEGORY_CODES as readonly string[]).includes(input.category)) {
      return;
    }
    if (!(await this.isEnabled(input.category))) {
      return;
    }

    const ctx = getAuditContext();
    const auth = input.system ? null : ctx.auth;

    let actorType: AuditActorType = input.actorType ?? 'system';
    let actorUserId = input.actorUserId ?? null;
    let actorApiClientId = input.actorApiClientId ?? null;
    let actorRole = input.actorRole ?? null;

    if (!input.system && auth) {
      if (input.actorType == null) {
        actorType = auth.typ === 'api_client' ? 'api_client' : 'user';
      }
      if (input.actorUserId === undefined) {
        actorUserId = auth.userId;
      }
      if (input.actorApiClientId === undefined && auth.typ === 'api_client') {
        // client numeric id is not on principal; store clientId string in metadata if needed
        actorApiClientId = null;
      }
      if (input.actorRole === undefined) {
        actorRole = auth.role;
      }
    }

    const resourceId =
      input.resourceId == null ? null : String(input.resourceId).slice(0, 64);

    const metadata = this.sanitizeMetadata(input.metadata);

    await this.prisma.auditEvent.create({
      data: {
        categoryCode: input.category,
        action: input.action.slice(0, 40),
        actorType,
        actorUserId,
        actorApiClientId,
        actorRole: actorRole?.slice(0, 40) ?? null,
        tenantId: input.tenantId ?? null,
        resourceType: input.resourceType?.slice(0, 64) ?? null,
        resourceId,
        requestId: ctx.requestId?.slice(0, 128) ?? null,
        ip: ctx.ip?.slice(0, 64) ?? null,
        userAgent: ctx.userAgent?.slice(0, 512) ?? null,
        metadata: metadata === undefined ? undefined : (metadata as Prisma.InputJsonValue),
      },
    });
  }

  recordFromAuth(
    auth: AuthPrincipal | null | undefined,
    input: Omit<AuditRecordInput, 'actorType' | 'actorUserId' | 'actorRole'> & {
      actorType?: AuditActorType;
    },
  ): void {
    if (!auth) {
      this.record({ ...input, system: true, actorType: input.actorType ?? 'system' });
      return;
    }
    this.record({
      ...input,
      actorType: input.actorType ?? (auth.typ === 'api_client' ? 'api_client' : 'user'),
      actorUserId: auth.userId,
      actorRole: auth.role,
      tenantId: input.tenantId ?? auth.tenantId,
    });
  }

  async listCategories() {
    await this.ensureCategoriesSeeded();
    const active = new Set<string>(ALL_AUDIT_CATEGORY_CODES);
    const rows = await this.prisma.auditCategory.findMany({
      where: { code: { in: [...ALL_AUDIT_CATEGORY_CODES] } },
      orderBy: [{ group: 'asc' }, { code: 'asc' }],
    });
    return rows
      .filter((r) => active.has(r.code))
      .map((r) => ({
        code: r.code,
        label: r.label,
        description: r.description,
        group: r.group,
        enabled: r.enabled,
        updated_at: r.updatedAt.toISOString(),
        updated_by_user_id: r.updatedByUserId,
      }));
  }

  async setCategoryEnabled(
    code: string,
    enabled: boolean,
    actorUserId: number | null,
  ) {
    const existing = await this.prisma.auditCategory.findUnique({
      where: { code },
    });
    if (!existing) {
      throw new NotFoundException(`Unknown audit category: ${code}`);
    }

    const updated = await this.prisma.auditCategory.update({
      where: { code },
      data: {
        enabled,
        updatedByUserId: actorUserId,
      },
    });
    this.invalidateEnabledCache();

    return {
      code: updated.code,
      label: updated.label,
      description: updated.description,
      group: updated.group,
      enabled: updated.enabled,
      updated_at: updated.updatedAt.toISOString(),
      updated_by_user_id: updated.updatedByUserId,
    };
  }

  private sanitizeMetadata(
    metadata: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | null | undefined {
    if (metadata == null) {
      return metadata;
    }
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (value === undefined) continue;
      const lower = key.toLowerCase();
      if (
        lower.includes('password') ||
        lower.includes('secret') ||
        lower.includes('token') ||
        lower === 'edi' ||
        lower.includes('payload')
      ) {
        continue;
      }
      cleaned[key] = value;
    }
    try {
      const raw = JSON.stringify(cleaned);
      if (raw.length > MAX_METADATA_JSON_BYTES) {
        return { truncated: true, keys: Object.keys(cleaned).slice(0, 20) };
      }
      return cleaned;
    } catch {
      return { truncated: true };
    }
  }
}
