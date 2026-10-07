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
 * Ensures principal may access claim `:id` or `:claimId` via owning batch.
 * Cross-tenant → 404 Claim not found.
 */
@Injectable()
export class ClaimOwnershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthPrincipal;
      params: { id?: string; claimId?: string };
    }>();
    const auth = request.user;
    if (!auth) {
      throw new ForbiddenException('Missing authentication.');
    }

    const raw = request.params.claimId ?? request.params.id;
    const claimId = Number(raw);
    if (!Number.isFinite(claimId)) {
      throw new NotFoundException('Claim not found.');
    }

    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: { batchFile: { select: { uploadedById: true } } },
    });
    if (!claim) {
      throw new NotFoundException('Claim not found.');
    }

    if (auth.typ === 'user' && auth.role && isStaffRole(auth.role)) {
      return true;
    }

    const ownerId = auth.userId;
    if (ownerId == null) {
      throw new ForbiddenException('Not allowed to access this claim.');
    }

    if (claim.batchFile.uploadedById !== ownerId) {
      throw new NotFoundException('Claim not found.');
    }

    return true;
  }
}
