import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isStaffRole } from '../../modules/auth/auth.constants';
import { AuthPrincipal } from '../../modules/auth/auth.types';

/**
 * Ensures the authenticated principal may access the batch identified by `:id`.
 * Customers / API clients are limited to batches where `uploaded_by` matches owner user id.
 */
@Injectable()
export class BatchOwnershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthPrincipal;
      params: { id: string };
    }>();
    const auth = request.user;
    if (!auth) {
      throw new ForbiddenException('Missing authentication.');
    }

    const batchId = Number(request.params.id);
    if (!Number.isFinite(batchId)) {
      throw new NotFoundException('Batch not found.');
    }

    const batch = await this.prisma.batchFile.findUnique({ where: { id: batchId } });
    if (!batch) {
      throw new NotFoundException('Batch not found.');
    }

    if (auth.typ === 'user' && auth.role && isStaffRole(auth.role)) {
      return true;
    }

    const ownerId =
      auth.typ === 'api_client' ? auth.userId : auth.userId;

    if (ownerId == null) {
      // Service API clients without a customer owner cannot read customer batches.
      throw new ForbiddenException('Not allowed to access this batch.');
    }

    if (batch.uploadedById !== ownerId) {
      // Match common API style: hide existence from other tenants.
      throw new NotFoundException('Batch not found.');
    }

    return true;
  }
}
