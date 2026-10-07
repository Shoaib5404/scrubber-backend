import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isStaffRole } from '../../modules/auth/auth.constants';
import { AuthPrincipal } from '../../modules/auth/auth.types';

/**
 * Ensures the authenticated principal may access the batch identified by `:id` or `:batchId`.
 * Customers / API clients are limited to batches where `uploaded_by` matches owner user id.
 */
@Injectable()
export class BatchOwnershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthPrincipal;
      params: { id?: string; batchId?: string };
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

    if (auth.typ === 'user' && auth.role && isStaffRole(auth.role)) {
      return true;
    }

    const ownerId = auth.userId;
    if (ownerId == null) {
      throw new ForbiddenException('Not allowed to access this batch.');
    }

    if (batch.uploadedById !== ownerId) {
      throw new NotFoundException('Batch not found.');
    }

    return true;
  }
}
