import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UserRole } from '../auth/auth.constants';
import type { AuthPrincipal } from '../auth/auth.types';
import { AuditCategoryCode } from '../audit/audit.catalog';
import { AuditService } from '../audit/audit.service';
import { BUSINESS_RULE_CATALOG } from './business-rule.catalog';
import {
  BUSINESS_RULE_SCOPE,
  GLOBAL_SCOPE_ID,
  effectiveEnabled,
  type BusinessRuleScope,
} from './business-rule-effective';

const GRANTABLE_ROLES = [UserRole.Admin, UserRole.User, UserRole.TenantAdmin] as const;

export type BusinessRuleListQuery = {
  page?: number;
  per_page?: number;
  search?: string;
  category?: string;
  enabled?: 'on' | 'off';
};

@Injectable()
export class BusinessRulesService implements OnModuleInit {
  private readonly logger = new Logger(BusinessRulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.syncCatalog();
    } catch (err) {
      this.logger.warn(
        `Business rule catalog was not seeded: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async syncCatalog(): Promise<number> {
    for (const entry of BUSINESS_RULE_CATALOG) {
      await this.prisma.businessRule.upsert({
        where: { ruleKey: entry.ruleKey },
        create: {
          ruleKey: entry.ruleKey,
          name: entry.name,
          description: entry.description,
          category: entry.category,
          severity: entry.severity,
          defaultEnabled: true,
        },
        update: {
          name: entry.name,
          description: entry.description,
          category: entry.category,
          severity: entry.severity,
        },
      });
    }
    return BUSINESS_RULE_CATALOG.length;
  }

  /**
   * Rule keys that must not produce findings for this uploader.
   * An empty catalog (migration not applied) leaves every rule on.
   */
  async disabledKeys(userId: number | null): Promise<Set<string>> {
    const rules = await this.prisma.businessRule.findMany({
      select: { id: true, ruleKey: true, defaultEnabled: true },
    });
    if (rules.length === 0) return new Set();

    const settings = await this.prisma.businessRuleSetting.findMany({
      where: {
        OR: [
          { scopeType: BUSINESS_RULE_SCOPE.Global, scopeId: GLOBAL_SCOPE_ID },
          ...(userId != null
            ? [{ scopeType: BUSINESS_RULE_SCOPE.User, scopeId: userId }]
            : []),
        ],
      },
      select: { ruleId: true, scopeType: true, enabled: true },
    });

    const platform = new Map<number, boolean>();
    const personal = new Map<number, boolean>();
    for (const row of settings) {
      if (row.scopeType === BUSINESS_RULE_SCOPE.User) personal.set(row.ruleId, row.enabled);
      else platform.set(row.ruleId, row.enabled);
    }

    const disabled = new Set<string>();
    for (const rule of rules) {
      const enabled = effectiveEnabled(
        rule.defaultEnabled,
        platform.get(rule.id),
        personal.get(rule.id),
      );
      if (!enabled) disabled.add(rule.ruleKey);
    }
    return disabled;
  }

  async list(auth: AuthPrincipal, query: BusinessRuleListQuery) {
    const access = await this.accessFor(auth);
    if (!access.canManageGlobal && !access.canManageOwn) {
      throw new ForbiddenException('You cannot view business rule switches.');
    }

    const rules = await this.prisma.businessRule.findMany({
      orderBy: [{ category: 'asc' }, { ruleKey: 'asc' }],
    });
    const settings = await this.prisma.businessRuleSetting.findMany({
      where: {
        OR: [
          { scopeType: BUSINESS_RULE_SCOPE.Global, scopeId: GLOBAL_SCOPE_ID },
          ...(auth.userId != null
            ? [{ scopeType: BUSINESS_RULE_SCOPE.User, scopeId: auth.userId }]
            : []),
        ],
      },
    });
    const platform = new Map(
      settings
        .filter((row) => row.scopeType === BUSINESS_RULE_SCOPE.Global)
        .map((row) => [row.ruleId, row]),
    );
    const personal = new Map(
      settings
        .filter((row) => row.scopeType === BUSINESS_RULE_SCOPE.User)
        .map((row) => [row.ruleId, row]),
    );

    const search = query.search?.trim().toLowerCase() ?? '';
    const category = query.category?.trim() ?? '';
    let rows = rules.map((rule) => {
      const platformRow = platform.get(rule.id);
      const personalRow = personal.get(rule.id);
      const platformEnabled = platformRow?.enabled ?? rule.defaultEnabled;
      const effective = effectiveEnabled(
        rule.defaultEnabled,
        platformRow?.enabled,
        personalRow?.enabled,
      );
      return {
        rule_key: rule.ruleKey,
        name: rule.name,
        description: rule.description,
        category: rule.category,
        severity: rule.severity,
        platform_enabled: platformEnabled,
        platform_version: platformRow?.version ?? 0,
        personal_enabled: personalRow ? personalRow.enabled : null,
        personal_version: personalRow?.version ?? 0,
        effective_enabled: effective,
      };
    });

    if (search) {
      rows = rows.filter(
        (row) =>
          row.rule_key.toLowerCase().includes(search) ||
          row.name.toLowerCase().includes(search) ||
          row.description.toLowerCase().includes(search),
      );
    }
    if (category) {
      rows = rows.filter((row) => row.category === category);
    }
    if (query.enabled === 'on') rows = rows.filter((row) => row.effective_enabled);
    if (query.enabled === 'off') rows = rows.filter((row) => !row.effective_enabled);

    const page = query.page ?? 1;
    const perPage = Math.min(query.per_page ?? 25, 100);
    const total = rows.length;
    const start = (page - 1) * perPage;
    const categories = [...new Set(rules.map((rule) => rule.category))].sort();

    return {
      current_page: page,
      per_page: perPage,
      total,
      last_page: Math.max(1, Math.ceil(total / perPage)),
      can_manage_global: access.canManageGlobal,
      can_manage_own: access.canManageOwn,
      categories,
      data: rows.slice(start, start + perPage),
    };
  }

  async update(
    auth: AuthPrincipal,
    ruleKey: string,
    input: { scope: BusinessRuleScope; enabled?: boolean; inherit?: boolean; version: number },
  ) {
    const access = await this.accessFor(auth);
    if (input.scope === BUSINESS_RULE_SCOPE.Global && !access.canManageGlobal) {
      throw new ForbiddenException('Only a super admin can change the platform default.');
    }
    if (input.scope === BUSINESS_RULE_SCOPE.User && !access.canManageOwn) {
      throw new ForbiddenException('You cannot change business rule switches.');
    }
    if (auth.userId == null) {
      throw new ForbiddenException('A user account is required to change business rule switches.');
    }

    const rule = await this.prisma.businessRule.findUnique({ where: { ruleKey } });
    if (!rule) throw new NotFoundException('Business rule not found.');

    const scopeId =
      input.scope === BUSINESS_RULE_SCOPE.Global ? GLOBAL_SCOPE_ID : auth.userId;

    if (input.scope === BUSINESS_RULE_SCOPE.User && input.inherit) {
      const existing = await this.prisma.businessRuleSetting.findUnique({
        where: {
          ruleId_scopeType_scopeId: { ruleId: rule.id, scopeType: input.scope, scopeId },
        },
      });
      if (!existing) {
        return this.present(auth, rule.id);
      }
      if (existing.version !== input.version) {
        throw new ConflictException('This switch was changed by someone else. Refresh and try again.');
      }
      await this.prisma.businessRuleSetting.delete({ where: { id: existing.id } });
      this.audit.record({
        category: AuditCategoryCode.BusinessRulePersonalUpdate,
        action: 'inherit',
        actorUserId: auth.userId,
        resourceType: 'business_rule',
        resourceId: rule.ruleKey,
        metadata: {
          rule_key: rule.ruleKey,
          scope: input.scope,
          previous_enabled: existing.enabled,
          effective: 'platform',
        },
      });
      return this.present(auth, rule.id);
    }

    if (typeof input.enabled !== 'boolean') {
      throw new BadRequestException('enabled is required.');
    }

    const existing = await this.prisma.businessRuleSetting.findUnique({
      where: {
        ruleId_scopeType_scopeId: { ruleId: rule.id, scopeType: input.scope, scopeId },
      },
    });
    const currentVersion = existing?.version ?? 0;
    if (currentVersion !== input.version) {
      throw new ConflictException('This switch was changed by someone else. Refresh and try again.');
    }

    const saved = existing
      ? await this.prisma.businessRuleSetting.update({
          where: { id: existing.id },
          data: {
            enabled: input.enabled,
            version: { increment: 1 },
            updatedById: auth.userId,
          },
        })
      : await this.prisma.businessRuleSetting.create({
          data: {
            ruleId: rule.id,
            scopeType: input.scope,
            scopeId,
            enabled: input.enabled,
            version: 1,
            updatedById: auth.userId,
          },
        });

    this.audit.record({
      category:
        input.scope === BUSINESS_RULE_SCOPE.Global
          ? AuditCategoryCode.BusinessRuleGlobalUpdate
          : AuditCategoryCode.BusinessRulePersonalUpdate,
      action: input.enabled ? 'enable' : 'disable',
      actorUserId: auth.userId,
      resourceType: 'business_rule',
      resourceId: rule.ruleKey,
      metadata: {
        rule_key: rule.ruleKey,
        scope: input.scope,
        previous_enabled: existing?.enabled ?? rule.defaultEnabled,
        enabled: saved.enabled,
        version: saved.version,
      },
    });

    return this.present(auth, rule.id);
  }

  async listGrants(auth: AuthPrincipal, search?: string) {
    this.assertSuperAdmin(auth);
    const grants = await this.prisma.businessRuleGrant.findMany({
      where: { revokedAt: null },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        grantedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { id: 'desc' },
    });
    const q = search?.trim();
    const matches = q
      ? await this.prisma.user.findMany({
          where: {
            role: { in: [...GRANTABLE_ROLES] },
            isActive: true,
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, name: true, email: true, role: true },
          take: 20,
          orderBy: { email: 'asc' },
        })
      : [];

    return {
      grants: grants.map((grant) => ({
        id: grant.id,
        user_id: grant.userId,
        user: grant.user,
        granted_by: grant.grantedBy,
        created_at: grant.createdAt.toISOString(),
      })),
      matches,
    };
  }

  async grant(auth: AuthPrincipal, userId: number) {
    this.assertSuperAdmin(auth);
    if (auth.userId == null) {
      throw new ForbiddenException('A user account is required to grant access.');
    }
    if (userId === auth.userId) {
      throw new BadRequestException('You already manage platform defaults.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true, name: true, email: true },
    });
    if (!user || !user.isActive) throw new NotFoundException('User not found.');
    if (!(GRANTABLE_ROLES as readonly string[]).includes(user.role)) {
      throw new BadRequestException(
        'Access can be granted to staff admins, staff users, and tenant admins.',
      );
    }

    const existing = await this.prisma.businessRuleGrant.findFirst({
      where: { userId, revokedAt: null },
    });
    if (existing) {
      return { id: existing.id, user_id: existing.userId, already_granted: true };
    }

    try {
      const created = await this.prisma.businessRuleGrant.create({
        data: { userId, grantedById: auth.userId },
      });
      this.audit.record({
        category: AuditCategoryCode.BusinessRuleGrant,
        action: 'grant',
        actorUserId: auth.userId,
        resourceType: 'user',
        resourceId: userId,
        metadata: { user_id: userId, role: user.role, email: user.email },
      });
      return { id: created.id, user_id: created.userId, already_granted: false };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const row = await this.prisma.businessRuleGrant.findFirst({
          where: { userId, revokedAt: null },
        });
        if (row) return { id: row.id, user_id: row.userId, already_granted: true };
      }
      throw err;
    }
  }

  async revoke(auth: AuthPrincipal, grantId: number) {
    this.assertSuperAdmin(auth);
    const grant = await this.prisma.businessRuleGrant.findUnique({ where: { id: grantId } });
    if (!grant || grant.revokedAt) throw new NotFoundException('Grant not found.');
    await this.prisma.businessRuleGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date() },
    });
    this.audit.record({
      category: AuditCategoryCode.BusinessRuleRevoke,
      action: 'revoke',
      actorUserId: auth.userId,
      resourceType: 'user',
      resourceId: grant.userId,
      metadata: { user_id: grant.userId, grant_id: grant.id },
    });
    return { id: grant.id, revoked: true };
  }

  private async present(auth: AuthPrincipal, ruleId: number) {
    const rule = await this.prisma.businessRule.findUnique({ where: { id: ruleId } });
    if (!rule) return null;
    const settings = await this.prisma.businessRuleSetting.findMany({
      where: {
        ruleId,
        OR: [
          { scopeType: BUSINESS_RULE_SCOPE.Global, scopeId: GLOBAL_SCOPE_ID },
          ...(auth.userId != null
            ? [{ scopeType: BUSINESS_RULE_SCOPE.User, scopeId: auth.userId }]
            : []),
        ],
      },
    });
    const platformRow = settings.find((row) => row.scopeType === BUSINESS_RULE_SCOPE.Global);
    const personalRow = settings.find((row) => row.scopeType === BUSINESS_RULE_SCOPE.User);
    return {
      rule_key: rule.ruleKey,
      name: rule.name,
      description: rule.description,
      category: rule.category,
      severity: rule.severity,
      platform_enabled: platformRow?.enabled ?? rule.defaultEnabled,
      platform_version: platformRow?.version ?? 0,
      personal_enabled: personalRow ? personalRow.enabled : null,
      personal_version: personalRow?.version ?? 0,
      effective_enabled: effectiveEnabled(
        rule.defaultEnabled,
        platformRow?.enabled,
        personalRow?.enabled,
      ),
    };
  }

  private async accessFor(auth: AuthPrincipal): Promise<{
    canManageGlobal: boolean;
    canManageOwn: boolean;
  }> {
    const canManageGlobal = auth.typ === 'user' && auth.role === UserRole.SuperAdmin;
    if (canManageGlobal) return { canManageGlobal: true, canManageOwn: true };
    if (auth.typ !== 'user' || auth.userId == null) {
      return { canManageGlobal: false, canManageOwn: false };
    }
    const grant = await this.prisma.businessRuleGrant.findFirst({
      where: { userId: auth.userId, revokedAt: null },
      select: { id: true },
    });
    return { canManageGlobal: false, canManageOwn: grant != null };
  }

  private assertSuperAdmin(auth: AuthPrincipal): void {
    if (auth.typ !== 'user' || auth.role !== UserRole.SuperAdmin) {
      throw new ForbiddenException('Only a super admin can manage business rule access.');
    }
  }
}
