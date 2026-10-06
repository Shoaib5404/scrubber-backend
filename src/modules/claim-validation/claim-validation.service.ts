import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClaimIssue, ClaimValidationResult } from './types';
import { validateClaimFields } from './rules/claim-field.rules';

@Injectable()
export class ClaimValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async validateClaim(claimId: number): Promise<ClaimValidationResult> {
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: { diagnoses: true, serviceLines: true },
    });
    if (!claim) throw new NotFoundException('Claim not found.');

    let errors: ClaimIssue[] = [];
    const warnings: ClaimIssue[] = [];
    const infos: ClaimIssue[] = [];

    errors = errors.concat(
      validateClaimFields({
        billingProviderNpi: claim.billingProviderNpi,
        subscriberMemberId: claim.subscriberMemberId,
        payerId: claim.payerId,
        payerName: claim.payerName,
        totalCharge: Number(claim.totalCharge),
        diagnosesCount: claim.diagnoses.length,
      }),
    );

    const halt = errors.some((e) => e.rule === 'DOS-FUT-001');
    if (!halt) {
      void this.config.get('SCRUBBER_RULE_SWITCH_EM_BUNDLING', true);
    }

    for (const line of claim.serviceLines) {
      const status = errors.length ? 'error' : warnings.length ? 'warning' : 'valid';
      await this.prisma.serviceLine.update({
        where: { id: line.id },
        data: { status },
      });
    }

    const status = errors.length ? 'error' : warnings.length ? 'warning' : 'valid';
    await this.prisma.claim.update({
      where: { id: claim.id },
      data: {
        status,
        validationErrors: [...errors, ...warnings, ...infos],
      },
    });

    return {
      claim_id: claim.id,
      status,
      errors,
      warnings,
      infos,
      error_count: errors.length,
      warning_count: warnings.length,
      info_count: infos.length,
    };
  }

  async validateBatch(batchId: number, force = false): Promise<ClaimValidationResult[]> {
    const claims = await this.prisma.claim.findMany({
      where: force
        ? { batchFileId: batchId }
        : { batchFileId: batchId, NOT: { status: 'valid' } },
      select: { id: true },
    });
    const results: ClaimValidationResult[] = [];
    for (const c of claims) {
      results.push(await this.validateClaim(c.id));
    }
    const errorClaims = results.filter((r) => r.status === 'error').length;
    const warningClaims = results.filter((r) => r.status === 'warning').length;
    const validClaims = results.filter((r) => r.status === 'valid').length;
    await this.prisma.batchFile.update({
      where: { id: batchId },
      data: {
        status: 'validated',
        errorClaims,
        warningClaims,
        validClaims,
        processedAt: new Date(),
      },
    });
    return results;
  }
}
