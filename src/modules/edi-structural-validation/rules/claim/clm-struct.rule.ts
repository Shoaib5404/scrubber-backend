import { isValidPlaceOfService } from '../../support/place-of-service.validator';
import {
  clmControlNumber,
  clmFrequencyCode,
  clmPlaceOfService,
  clmTotalCharge,
  extractServiceLines,
  parseAmount,
  serviceLineChargeAmount,
  claimHasRefQualifier,
} from '../../support/parsed-claim.helpers';
import { bodySegmentsInTransaction, eachTransaction, extractClaims } from '../../support/loop-segment-scope';
import {
  Edi837RuleContext,
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../../types';

const RULE_ID = 'CLM-STRUCT';
const GROUP = 'claim';

function validateClaim(
  claim: { clm: EdiSegment; segments: EdiSegment[] },
  componentSeparator: string,
  seenClaimIds: Map<string, boolean>,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const clm = claim.clm;

  const claimId = clmControlNumber(clm);
  if (claimId === '') {
    issues.push(
      issue(RULE_ID, 'error', 'CLM01 patient control number is required', GROUP, {
        segment: 'CLM',
        segment_index: clm.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'CLM01',
      }),
    );
  } else if (seenClaimIds.has(claimId)) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        `CLM01 '${claimId}' must be unique within the transaction set`,
        GROUP,
        {
          segment: 'CLM',
          segment_index: clm.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'CLM01',
        },
      ),
    );
  } else {
    seenClaimIds.set(claimId, true);
  }

  const totalCharge = parseAmount(clmTotalCharge(clm));
  if (totalCharge == null || totalCharge <= 0) {
    issues.push(
      issue(RULE_ID, 'error', 'CLM02 total claim charge must be greater than zero', GROUP, {
        segment: 'CLM',
        segment_index: clm.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'CLM02',
      }),
    );
  }

  let lineSum = 0;
  for (const line of extractServiceLines(claim.segments)) {
    lineSum += parseAmount(serviceLineChargeAmount(line)) ?? 0;
  }

  if (totalCharge != null && Math.abs(totalCharge - lineSum) > 0.009) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        `CLM02 (${totalCharge.toFixed(2)}) must equal sum of SV102 line charges (${lineSum.toFixed(2)})`,
        GROUP,
        {
          segment: 'CLM',
          segment_index: clm.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'CLM02',
        },
      ),
    );
  }

  const frequency = clmFrequencyCode(clm, componentSeparator);
  if ((frequency === '7' || frequency === '8') && !claimHasRefQualifier(claim.segments, 'F8')) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        `Frequency code ${frequency} requires REF*F8 original claim reference`,
        GROUP,
        {
          segment: 'CLM',
          segment_index: clm.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'CLM05-3',
        },
      ),
    );
  }

  const pos = clmPlaceOfService(clm, componentSeparator);
  if (pos == null || pos.trim() === '') {
    issues.push(
      issue(RULE_ID, 'error', 'Place of service (CLM05-1) is required', GROUP, {
        segment: 'CLM',
        segment_index: clm.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'CLM05-1',
      }),
    );
  } else if (!isValidPlaceOfService(pos)) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        `Place of service '${pos}' (CLM05-1) is not a valid CMS POS code`,
        GROUP,
        {
          segment: 'CLM',
          segment_index: clm.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'CLM05-1',
        },
      ),
    );
  }

  return issues;
}

export function clmStructRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument, _ctx: Edi837RuleContext): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];
      for (const tx of eachTransaction(doc)) {
        const seenClaimIds = new Map<string, boolean>();
        const body = bodySegmentsInTransaction(tx.segments);
        for (const claim of extractClaims(body)) {
          issues.push(
            ...validateClaim(
              claim,
              doc.componentSeparator,
              seenClaimIds,
              tx.functionalGroupIndex,
              tx.transactionSetIndex,
            ),
          );
        }
      }
      return issues;
    },
  };
}
