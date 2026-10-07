import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ClaimValidationService } from '../../claim-validation/claim-validation.service';
import { TERMINAL_CLAIM_STATUSES, ValidateClaimJobData } from '../queue.constants';

/** Laravel ValidateClaimJob — idempotent; skips terminal claims unless force. */
@Injectable()
export class ValidateClaimProcessor {
  private readonly logger = new Logger(ValidateClaimProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claimValidation: ClaimValidationService,
  ) {}

  async handle(data: ValidateClaimJobData): Promise<void> {
    const claim = await this.prisma.claim.findUnique({
      where: { id: data.claimId },
      select: { id: true, status: true, batchFileId: true },
    });
    if (!claim) {
      this.logger.warn(`ValidateClaimJob skipped; claim missing id=${data.claimId}`);
      return;
    }

    if (!data.force && TERMINAL_CLAIM_STATUSES.has(claim.status)) {
      this.logger.log(
        `ValidateClaimJob skipped; claim already terminal id=${data.claimId} status=${claim.status}`,
      );
      return;
    }

    try {
      await this.claimValidation.validateClaim(data.claimId);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.prisma.claim.update({
        where: { id: data.claimId },
        data: {
          status: 'error',
          validationErrors: [
            {
              rule: 'SYS-001',
              field: 'system',
              message: `Validation failed: ${message}`,
            },
          ],
        },
      });
      throw e;
    }
  }
}
