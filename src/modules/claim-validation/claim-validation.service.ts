import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ClaimIssue, ClaimValidationResult } from './types';
import { validateClaimFields } from './rules/claim-field.rules';
import { validateClaimFilingIndicator } from './rules/claim-filing-indicator.rules';
import { validateBcbsClaimRouting } from './rules/bcbs-claim-routing.rules';
import { validateDosNotInFuture } from './rules/payer-edi-specific.rules';
import { validateServiceLineBasics } from './rules/service-line-basics.rules';
import { buildServiceLineStatusUpdates } from './support/service-line-status.updater';

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
    let warnings: ClaimIssue[] = [];
    const infos: ClaimIssue[] = [];

    // PHASE 1 — ClaimService::validate order
    errors = errors.concat(
      validateClaimFields({
        billingProviderNpi: claim.billingProviderNpi,
        subscriberMemberId: claim.subscriberMemberId,
        payerId: claim.payerId,
        payerName: claim.payerName,
        totalCharge: Number(claim.totalCharge),
        diagnosesCount: claim.diagnoses.length,
      }),
      validateClaimFilingIndicator({
        claimFilingIndicator: claim.claimFilingIndicator,
        payerResponsibility: claim.payerResponsibility,
        subscriberMemberId: claim.subscriberMemberId,
        subscriberDob: claim.subscriberDob,
        patientDob: claim.patientDob,
        otherSubscribers: claim.otherSubscribers,
        serviceDateFrom: claim.serviceLines[0]?.serviceDateFrom ?? null,
      }),
    );

    errors = errors.concat(
      await validateBcbsClaimRouting(this.prisma, {
        subscriberMemberId: claim.subscriberMemberId,
        payerId: claim.payerId,
      }),
    );

    for (const issue of validateDosNotInFuture(
      claim.serviceLines.map((l) => ({
        lineNumber: l.lineNumber,
        serviceDateFrom: l.serviceDateFrom,
        serviceDateTo: l.serviceDateTo,
      })),
      {
        onsetOfIllnessDate: claim.onsetOfIllnessDate,
        lastMenstrualPeriodDate: claim.lastMenstrualPeriodDate,
        initialTreatmentDate: claim.initialTreatmentDate,
        lastSeenDate: claim.lastSeenDate,
        accidentDate: claim.accidentDate,
        lastXrayDate: claim.lastXrayDate,
        admissionDate: claim.admissionDate,
        dischargeDate: claim.dischargeDate,
        hearingVisionPrescriptionDate: claim.hearingVisionPrescriptionDate,
        disabilityStartDate: claim.disabilityStartDate,
        disabilityEndDate: claim.disabilityEndDate,
        lastWorkedDate: claim.lastWorkedDate,
        authorizedReturnToWorkDate: claim.authorizedReturnToWorkDate,
        assumedCareDate: claim.assumedCareDate,
        relinquishedCareDate: claim.relinquishedCareDate,
      },
    )) {
      const severity = issue.severity ?? 'error';
      if (severity === 'info') infos.push(issue);
      else if (severity === 'warning') warnings.push(issue);
      else errors.push(issue);
    }

    const haltAfterDosFutureGate = errors.some((e) => e.rule === 'DOS-FUT-001');

    // PHASE 1b–3: skipped when DOS-FUT-001 fails
    if (!haltAfterDosFutureGate) {
      void this.config.get('SCRUBBER_RULE_SWITCH_EM_BUNDLING', true);

      // Service line basics (Laravel runs on valid-CPT lines; CPT gate deferred)
      const maxSequence =
        claim.diagnoses.length === 0
          ? null
          : Math.max(...claim.diagnoses.map((d) => d.sequence));
      const lineBasics = validateServiceLineBasics(
        claim.serviceLines.map((l) => ({
          lineNumber: l.lineNumber,
          procedureCode: l.procedureCode,
          chargeAmount: Number(l.chargeAmount),
          units: Number(l.units),
          serviceDateFrom: l.serviceDateFrom,
          serviceDateTo: l.serviceDateTo,
          diagnosisPointers: l.diagnosisPointers,
        })),
        maxSequence,
      );
      errors = errors.concat(lineBasics.errors);
      warnings = warnings.concat(lineBasics.warnings);
    }

    // PHASE 4: status updater
    const lineUpdates = buildServiceLineStatusUpdates(
      claim.serviceLines.map((l) => ({ id: l.id, lineNumber: l.lineNumber })),
      errors,
      warnings,
    );
    for (const update of lineUpdates) {
      await this.prisma.serviceLine.update({
        where: { id: update.id },
        data: {
          status: update.status,
          validationErrors: update.validationErrors,
        },
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
