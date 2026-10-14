import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditCategoryCode } from '../audit/audit.catalog';
import { AuditService } from '../audit/audit.service';
import { isTenantRole, UserRole } from '../auth/auth.constants';
import { PasswordService } from '../auth/password.service';
import { ApiClientIssuerService } from '../ops-cli/api-client-issuer.service';
import {
  CreateApiClientDto,
  CreateUserDto,
  ListUsersQueryDto,
  ReissueApiClientDto,
  UpdateUserDto,
} from './users-admin.dto';

function roleLabel(role: string): string {
  switch (role) {
    case UserRole.SuperAdmin:
      return 'Super Admin';
    case UserRole.Admin:
      return 'Admin';
    case UserRole.User:
      return 'User';
    case UserRole.Customer:
      return 'Customer';
    case UserRole.TenantAdmin:
      return 'Tenant Admin';
    default:
      return role;
  }
}

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base.length > 0 ? base : 'tenant';
}

function serializeUser(user: {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  plan: string | null;
  subscriptionStatus: string;
  subscriptionStartsAt: Date | null;
  subscriptionEndsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    is_active: user.isActive,
    plan: user.plan,
    subscription_status: user.subscriptionStatus,
    subscription_starts_at: user.subscriptionStartsAt,
    subscription_ends_at: user.subscriptionEndsAt,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };
}

function serializeApiClient(client: {
  id: number;
  name: string;
  clientId: string;
  userId: number | null;
  isActive: boolean;
  scopes: unknown;
  lastUsedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: client.id,
    name: client.name,
    client_id: client.clientId,
    user_id: client.userId,
    is_active: client.isActive,
    scopes: client.scopes,
    last_used_at: client.lastUsedAt,
    created_at: client.createdAt,
  };
}

@Injectable()
export class UsersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly issuer: ApiClientIssuerService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const perPage = Math.min(query.per_page ?? 20, 100);
    const where: Prisma.UserWhereInput = {};
    if (query.role) {
      where.role = query.role;
    }
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    return {
      current_page: page,
      per_page: perPage,
      total,
      last_page: Math.max(1, Math.ceil(total / perPage)),
      data: rows.map(serializeUser),
    };
  }

  async show(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found.');
    return serializeUser(user);
  }

  assignableRolesFor(actorRole: string): string[] {
    if (actorRole === UserRole.SuperAdmin) {
      return [UserRole.Admin, UserRole.User, UserRole.Customer];
    }
    if (actorRole === UserRole.Admin) {
      return [UserRole.User, UserRole.Customer];
    }
    return [];
  }

  formMeta(actorRole: string) {
    return {
      assignable_roles: this.assignableRolesFor(actorRole).map((value) => ({
        value,
        label: roleLabel(value),
      })),
      plans: [
        { value: 'basic', label: 'Basic' },
        { value: 'pro', label: 'Pro' },
        { value: 'enterprise', label: 'Enterprise' },
      ],
      subscription_statuses: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
        { value: 'expired', label: 'Expired' },
        { value: 'cancelled', label: 'Cancelled' },
      ],
    };
  }

  async create(dto: CreateUserDto, actorRole: string) {
    this.assertActorCanAssign(actorRole, dto.role);
    const password = await this.passwords.hashPassword(dto.password);
    const normalized = this.normalizeSubscriptionFields(dto);
    try {
      let tenantId: number | null = null;
      if (isTenantRole(dto.role)) {
        const base = slugify(`${dto.name}-${dto.email.split('@')[0]}`);
        let slug = base;
        let n = 0;
        while (await this.prisma.tenant.findUnique({ where: { slug } })) {
          n += 1;
          slug = `${base}-${n}`;
        }
        const tenant = await this.prisma.tenant.create({
          data: {
            name: `${dto.name.trim()} Org`,
            slug,
            status: 'active',
            subscriptionStatus: normalized.subscription_status,
            subscriptionStartsAt: normalized.subscription_starts_at,
            subscriptionEndsAt: normalized.subscription_ends_at,
          },
        });
        tenantId = tenant.id;
      }

      const user = await this.prisma.user.create({
        data: {
          name: dto.name.trim(),
          email: dto.email.trim().toLowerCase(),
          password,
          role: dto.role,
          tenantId,
          isActive: dto.is_active,
          emailVerifiedAt: new Date(),
          plan: normalized.plan,
          subscriptionStatus: normalized.subscription_status,
          subscriptionStartsAt: normalized.subscription_starts_at,
          subscriptionEndsAt: normalized.subscription_ends_at,
        },
      });
      this.audit.record({
        category: AuditCategoryCode.AdminUserCreate,
        action: 'created',
        resourceType: 'user',
        resourceId: user.id,
        tenantId: user.tenantId,
        metadata: { role: user.role, is_active: user.isActive },
      });
      if (tenantId != null) {
        this.audit.record({
          category: AuditCategoryCode.AdminTenantCreate,
          action: 'created',
          resourceType: 'tenant',
          resourceId: tenantId,
          tenantId,
          metadata: { via: 'user_create' },
        });
      }
      return serializeUser(user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('Email already in use.');
      }
      throw e;
    }
  }

  async update(
    id: number,
    dto: UpdateUserDto,
    actorUserId: number,
    actorRole: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found.');
    if (user.role === UserRole.SuperAdmin) {
      throw new ForbiddenException('Super Admin account cannot be updated.');
    }
    this.assertActorCanAssign(actorRole, dto.role);
    if (id === actorUserId && dto.is_active === false) {
      throw new BadRequestException('You cannot deactivate your own account.');
    }

    const normalized = this.normalizeSubscriptionFields(dto);
    const data: Prisma.UserUpdateInput = {
      name: dto.name.trim(),
      email: dto.email.trim().toLowerCase(),
      role: dto.role,
      isActive: dto.is_active,
      plan: normalized.plan,
      subscriptionStatus: normalized.subscription_status,
      subscriptionStartsAt: normalized.subscription_starts_at,
      subscriptionEndsAt: normalized.subscription_ends_at,
    };
    if (dto.password && dto.password.trim() !== '') {
      data.password = await this.passwords.hashPassword(dto.password);
    }

    try {
      const updated = await this.prisma.user.update({ where: { id }, data });
      this.audit.record({
        category: AuditCategoryCode.AdminUserUpdate,
        action: 'updated',
        resourceType: 'user',
        resourceId: updated.id,
        tenantId: updated.tenantId,
        metadata: {
          role: updated.role,
          is_active: updated.isActive,
          password_changed: Boolean(dto.password && dto.password.trim() !== ''),
          actor_user_id: actorUserId,
        },
      });
      return serializeUser(updated);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('Email already in use.');
      }
      throw e;
    }
  }

  async getApiClient(userId: number) {
    await this.requireCustomer(userId);
    const client = await this.prisma.apiClient.findUnique({ where: { userId } });
    return client ? serializeApiClient(client) : null;
  }

  async createApiClient(userId: number, dto: CreateApiClientDto, createdById: number) {
    await this.requireCustomer(userId);
    void createdById;
    const issued = await this.issuer.issueForCustomer(String(userId), dto.name);
    this.audit.record({
      category: AuditCategoryCode.AdminApiClient,
      action: 'created',
      resourceType: 'api_client',
      resourceId: issued.client.id,
      metadata: { user_id: userId, name: dto.name },
    });
    return {
      ...serializeApiClient({
        id: issued.client.id,
        name: issued.client.name,
        clientId: issued.client.clientId,
        userId: issued.client.userId,
        isActive: true,
        scopes: issued.client.scopes,
        lastUsedAt: null,
        createdAt: new Date(),
      }),
      plain_client_secret: issued.plainSecret,
    };
  }

  async rotateApiClient(userId: number, clientId: number) {
    await this.requireOwnedClient(userId, clientId);
    const issued = await this.issuer.rotateSecret(clientId);
    this.audit.record({
      category: AuditCategoryCode.AdminApiClient,
      action: 'rotated',
      resourceType: 'api_client',
      resourceId: clientId,
      metadata: { user_id: userId },
    });
    return {
      ...serializeApiClient({
        id: issued.client.id,
        name: issued.client.name,
        clientId: issued.client.clientId,
        userId: issued.client.userId,
        isActive: true,
        scopes: issued.client.scopes,
        lastUsedAt: null,
        createdAt: new Date(),
      }),
      plain_client_secret: issued.plainSecret,
    };
  }

  async reissueApiClient(userId: number, clientId: number, dto: ReissueApiClientDto) {
    await this.requireOwnedClient(userId, clientId);
    const issued = await this.issuer.reissue(clientId, dto.name);
    this.audit.record({
      category: AuditCategoryCode.AdminApiClient,
      action: 'reissued',
      resourceType: 'api_client',
      resourceId: clientId,
      metadata: { user_id: userId },
    });
    return {
      ...serializeApiClient({
        id: issued.client.id,
        name: issued.client.name,
        clientId: issued.client.clientId,
        userId: issued.client.userId,
        isActive: true,
        scopes: issued.client.scopes,
        lastUsedAt: null,
        createdAt: new Date(),
      }),
      plain_client_secret: issued.plainSecret,
    };
  }

  async revokeApiClient(userId: number, clientId: number) {
    await this.requireOwnedClient(userId, clientId);
    await this.issuer.revoke(clientId);
    this.audit.record({
      category: AuditCategoryCode.AdminApiClient,
      action: 'revoked',
      resourceType: 'api_client',
      resourceId: clientId,
      metadata: { user_id: userId },
    });
    return { revoked: true };
  }

  private assertAssignableRole(role: string) {
    if (role === UserRole.SuperAdmin) {
      throw new BadRequestException('Super Admin cannot be assigned from this form.');
    }
  }

  private assertActorCanAssign(actorRole: string, role: string) {
    this.assertAssignableRole(role);
    if (!this.assignableRolesFor(actorRole).includes(role)) {
      throw new ForbiddenException('You cannot assign this role.');
    }
  }

  private normalizeSubscriptionFields(dto: {
    role: string;
    plan?: string | null;
    subscription_status?: string;
    subscription_starts_at?: string | null;
    subscription_ends_at?: string | null;
  }) {
    if (!isTenantRole(dto.role)) {
      return {
        plan: null,
        subscription_status: 'inactive',
        subscription_starts_at: null as Date | null,
        subscription_ends_at: null as Date | null,
      };
    }
    return {
      plan: dto.plan ?? null,
      subscription_status: dto.subscription_status ?? 'inactive',
      subscription_starts_at: dto.subscription_starts_at
        ? new Date(dto.subscription_starts_at)
        : null,
      subscription_ends_at: dto.subscription_ends_at ? new Date(dto.subscription_ends_at) : null,
    };
  }

  private async requireCustomer(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    if (!isTenantRole(user.role)) {
      throw new NotFoundException('User not found.');
    }
    return user;
  }

  private async requireOwnedClient(userId: number, clientId: number) {
    await this.requireCustomer(userId);
    const client = await this.prisma.apiClient.findUnique({ where: { id: clientId } });
    if (!client || client.userId !== userId) {
      throw new NotFoundException('API client not found.');
    }
    return client;
  }
}
