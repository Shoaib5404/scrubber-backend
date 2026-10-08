import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UserRole } from '../auth/auth.constants';
import { PasswordService } from '../auth/password.service';
import { ApiClientIssuerService } from '../ops-cli/api-client-issuer.service';
import {
  CreateApiClientDto,
  CreateUserDto,
  ListUsersQueryDto,
  ReissueApiClientDto,
  UpdateUserDto,
} from './users-admin.dto';

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

  async create(dto: CreateUserDto) {
    this.assertAssignableRole(dto.role);
    const password = await this.passwords.hashPassword(dto.password);
    const normalized = this.normalizeSubscriptionFields(dto);
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name.trim(),
          email: dto.email.trim().toLowerCase(),
          password,
          role: dto.role,
          isActive: dto.is_active,
          emailVerifiedAt: new Date(),
          plan: normalized.plan,
          subscriptionStatus: normalized.subscription_status,
          subscriptionStartsAt: normalized.subscription_starts_at,
          subscriptionEndsAt: normalized.subscription_ends_at,
        },
      });
      return serializeUser(user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('Email already in use.');
      }
      throw e;
    }
  }

  async update(id: number, dto: UpdateUserDto, actorUserId: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found.');
    if (user.role === UserRole.SuperAdmin) {
      throw new ForbiddenException('Super Admin account cannot be updated.');
    }
    this.assertAssignableRole(dto.role);
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
    return { revoked: true };
  }

  private assertAssignableRole(role: string) {
    if (role === UserRole.SuperAdmin) {
      throw new BadRequestException('Super Admin cannot be assigned from this form.');
    }
  }

  private normalizeSubscriptionFields(dto: {
    role: string;
    plan?: string | null;
    subscription_status?: string;
    subscription_starts_at?: string | null;
    subscription_ends_at?: string | null;
  }) {
    if (dto.role !== UserRole.Customer) {
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
    if (user.role !== UserRole.Customer) {
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
