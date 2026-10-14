import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { AuditCategoryCode } from '../../modules/audit/audit.catalog';
import { AuditService } from '../../modules/audit/audit.service';
import { AuthPrincipal } from '../../modules/auth/auth.types';

/**
 * Ensures the authenticated principal may access the batch identified by `:id` or `:batchId`.
 * Customers / API clients are limited to batches in their tenant.
 */
@Injectable()
export class BatchOwnershipGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantContext,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthPrincipal;
      params: { id?: string; batchId?: string };
      method?: string;
    }>();
    const auth = request.user;
    if (!auth) {
      throw new ForbiddenException('Missing authentication.');
    }

    const raw = request.params.batchId ?? request.params.id;
    const batchId = Number(raw);
    if (!Number.isFinite(batchId)) {
      throw new NotFoundException('Batch not found.');
    }

    const batch = await this.prisma.batchFile.findUnique({ where: { id: batchId } });
    if (!batch) {
      throw new NotFoundException('Batch not found.');
    }

    if (this.tenants.isStaff(auth)) {
      if (batch.tenantId != null && (request.method === 'GET' || request.method === 'HEAD')) {
        this.audit.recordFromAuth(auth, {
          category: AuditCategoryCode.StaffTenantBatchAccess,
          action: 'viewed',
          tenantId: batch.tenantId,
          resourceType: 'batch',
          resourceId: batchId,
        });
      }
      return true;
    }

    if (auth.tenantId == null) {
      throw new ForbiddenException('Not allowed to access this batch.');
    }

    if (batch.tenantId !== auth.tenantId) {
      throw new NotFoundException('Batch not found.');
    }

    return true;
  }
}
