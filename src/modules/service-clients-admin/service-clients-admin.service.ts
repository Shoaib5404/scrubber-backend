import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditCategoryCode } from '../audit/audit.catalog';
import { AuditService } from '../audit/audit.service';
import { ApiClientIssuerService } from '../ops-cli/api-client-issuer.service';
import {
  CreateServiceClientDto,
  ListServiceClientsQueryDto,
  ReissueServiceClientDto,
} from './service-clients-admin.dto';
import {
  isKnownServiceClientScope,
  SERVICE_CLIENT_SCOPE_CATALOG,
} from './service-clients.constants';

function serializeServiceClient(client: {
  id: number;
  name: string;
  clientId: string;
  userId: number | null;
  tenantId: number | null;
  isActive: boolean;
  scopes: unknown;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt?: Date;
}) {
  return {
    id: client.id,
    name: client.name,
    client_id: client.clientId,
    user_id: client.userId,
    tenant_id: client.tenantId,
    is_active: client.isActive,
    scopes: client.scopes,
    last_used_at: client.lastUsedAt?.toISOString() ?? null,
    created_at: client.createdAt.toISOString(),
    updated_at: client.updatedAt?.toISOString() ?? undefined,
    /** Platform service clients are unbound from tenants/users. */
    kind: 'platform_service' as const,
  };
}

@Injectable()
export class ServiceClientsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly issuer: ApiClientIssuerService,
    private readonly audit: AuditService,
  ) {}

  scopeCatalog() {
    return SERVICE_CLIENT_SCOPE_CATALOG;
  }

  async list(query: ListServiceClientsQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const perPage = Math.min(100, Math.max(1, query.per_page ?? 20));
    const where: Prisma.ApiClientWhereInput = {
      userId: null,
      tenantId: null,
    };
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { clientId: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.apiClient.count({ where }),
      this.prisma.apiClient.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    return {
      current_page: page,
      per_page: perPage,
      total,
      last_page: Math.max(1, Math.ceil(total / perPage)),
      data: rows.map(serializeServiceClient),
    };
  }

  async create(dto: CreateServiceClientDto, createdById: number | null) {
    const scopes = this.normalizeScopes(dto.scopes);
    const issued = await this.issuer.issueService(dto.name.trim(), scopes);
    if (createdById != null) {
      await this.prisma.apiClient.update({
        where: { id: issued.client.id },
        data: { createdBy: createdById },
      });
    }
    const client = await this.prisma.apiClient.findUniqueOrThrow({
      where: { id: issued.client.id },
    });
    this.audit.record({
      category: AuditCategoryCode.AdminServiceClient,
      action: 'created',
      resourceType: 'api_client',
      resourceId: client.id,
      metadata: { client_id: client.clientId, name: client.name },
    });
    return {
      ...serializeServiceClient(client),
      plain_client_secret: issued.plainSecret,
    };
  }

  async rotate(id: number) {
    const existing = await this.requirePlatformClient(id);
    const issued = await this.issuer.rotateSecret(existing.id);
    const client = await this.prisma.apiClient.findUniqueOrThrow({
      where: { id: existing.id },
    });
    this.audit.record({
      category: AuditCategoryCode.AdminServiceClient,
      action: 'rotated',
      resourceType: 'api_client',
      resourceId: id,
      metadata: { client_id: client.clientId },
    });
    return {
      ...serializeServiceClient(client),
      plain_client_secret: issued.plainSecret,
    };
  }

  async reissue(id: number, dto: ReissueServiceClientDto) {
    const existing = await this.requirePlatformClient(id);
    const issued = await this.issuer.reissue(existing.id, dto.name);
    const client = await this.prisma.apiClient.findUniqueOrThrow({
      where: { id: existing.id },
    });
    this.audit.record({
      category: AuditCategoryCode.AdminServiceClient,
      action: 'reissued',
      resourceType: 'api_client',
      resourceId: id,
      metadata: { client_id: client.clientId },
    });
    return {
      ...serializeServiceClient(client),
      plain_client_secret: issued.plainSecret,
    };
  }

  async revoke(id: number) {
    await this.requirePlatformClient(id);
    await this.issuer.revoke(id);
    this.audit.record({
      category: AuditCategoryCode.AdminServiceClient,
      action: 'revoked',
      resourceType: 'api_client',
      resourceId: id,
    });
    return { revoked: true };
  }

  private normalizeScopes(scopes: string[]): string[] {
    if (!Array.isArray(scopes) || scopes.length === 0) {
      throw new BadRequestException('At least one scope is required.');
    }
    const unique = [...new Set(scopes.map((s) => String(s).trim()).filter(Boolean))];
    const unknown = unique.filter((s) => !isKnownServiceClientScope(s));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown scope(s): ${unknown.join(', ')}.`);
    }
    return unique;
  }

  private async requirePlatformClient(id: number) {
    const client = await this.prisma.apiClient.findUnique({ where: { id } });
    if (!client || client.userId != null || client.tenantId != null) {
      throw new NotFoundException('Platform service client not found.');
    }
    return client;
  }
}
