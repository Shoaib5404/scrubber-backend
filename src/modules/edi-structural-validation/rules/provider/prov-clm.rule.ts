import { validateEdi837Address } from '../../support/address.validator';
import { validateEdi837Taxonomy } from '../../support/taxonomy.validator';
import {
  bodySegmentsInTransaction,
  eachTransaction,
  extractClaims,
} from '../../support/loop-segment-scope';
import { npiValidator } from '../../support/npi.validator';
import {
  Edi837RuleContext,
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../../types';

const RULE_ID = 'PROV-CLM';
const GROUP = 'provider';

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

function claimProviderSegments(claimSegments: EdiSegment[]): EdiSegment[] {
  const segments: EdiSegment[] = [];

  for (const segment of claimSegments) {
    if (segment.id === 'SBR' || segment.id === 'LX') break;
    if (segment.id === 'CLM') continue;
    segments.push(segment);
  }

  return segments;
}

function firstNm1ByEntity(segments: EdiSegment[], entityCode: string): EdiSegment | null {
  for (const segment of segments) {
    if (segment.id === 'NM1' && el(segment, 1) === entityCode) {
      return segment;
    }
  }
  return null;
}

function firstSegmentAfter(segments: EdiSegment[], afterIndex: number, type: string): EdiSegment | null {
  for (const segment of segments) {
    if (segment.index <= afterIndex) continue;
    if (segment.id === 'NM1' || segment.id === 'LX') break;
    if (segment.id === type) return segment;
  }
  return null;
}

function findPrvAfter(segments: EdiSegment[], after: EdiSegment, qualifier: string): EdiSegment | null {
  for (const segment of segments) {
    if (segment.index <= after.index) continue;
    if (segment.id === 'NM1' || segment.id === 'LX') break;
    if (segment.id === 'PRV' && el(segment, 1) === qualifier) return segment;
  }
  return null;
}

function validateProviderNpi(
  nm1: EdiSegment,
  label: string,
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const qualifier = el(nm1, 8);
  const npi = el(nm1, 9);

  if (qualifier !== '' && qualifier !== 'XX') {
    issues.push(
      issue(
        RULE_ID,
        'warning',
        `${label} identifier qualifier is '${qualifier}'; XX is expected for NPI`,
        GROUP,
        {
          segment: 'NM1',
          segment_index: nm1.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'NM108',
        },
      ),
    );
  }

  if (npi === '' || !/^\d{10}$/.test(npi)) {
    issues.push(
      issue(RULE_ID, 'error', `${label} NPI (NM109) must be exactly 10 digits`, GROUP, {
        segment: 'NM1',
        segment_index: nm1.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'NM109',
      }),
    );
  } else if (!npiValidator.validateLuhn(npi)) {
    issues.push(
      issue(RULE_ID, 'error', `${label} NPI fails Luhn check validation`, GROUP, {
        segment: 'NM1',
        segment_index: nm1.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'NM109',
      }),
    );
  }

  return issues;
}

function validateRenderingProvider(
  segments: EdiSegment[],
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const rendering = firstNm1ByEntity(segments, '82');

  if (!rendering) {
    return [
      issue(
        RULE_ID,
        'error',
        'Rendering provider NM1*82 (loop 2310B) is required for professional claims',
        GROUP,
        {
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'NM101',
        },
      ),
    ];
  }

  if (el(rendering, 3) === '') {
    issues.push(
      issue(RULE_ID, 'error', 'Rendering provider last name (NM103) is required', GROUP, {
        segment: 'NM1',
        segment_index: rendering.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'NM103',
      }),
    );
  }

  issues.push(...validateProviderNpi(rendering, 'Rendering provider', fg, tx));

  const prvPe = findPrvAfter(segments, rendering, 'PE');
  if (!prvPe) {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'Rendering provider taxonomy (PRV*PE) is required when NM1*82 is present',
        GROUP,
        {
          segment: 'NM1',
          segment_index: rendering.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'PRV',
        },
      ),
    );
  } else {
    for (const finding of validateEdi837Taxonomy(prvPe, 'Rendering')) {
      issues.push(
        issue(RULE_ID, finding.severity, finding.message, GROUP, {
          segment: 'PRV',
          segment_index: prvPe.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: finding.field,
        }),
      );
    }
  }

  return issues;
}

function validateServiceFacility(segments: EdiSegment[], fg: number, tx: number): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const facility = firstNm1ByEntity(segments, '77');

  if (!facility) return issues;

  if (el(facility, 3) === '') {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'Service facility name (NM103 in 2310C) is required when NM1*77 is present',
        GROUP,
        {
          segment: 'NM1',
          segment_index: facility.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'NM103',
        },
      ),
    );
  }

  const n3 = firstSegmentAfter(segments, facility.index, 'N3');
  const n4 = firstSegmentAfter(segments, facility.index, 'N4');

  for (const finding of validateEdi837Address(n3, n4, 'Service facility')) {
    issues.push(
      issue(RULE_ID, 'error', finding.message, GROUP, {
        segment: finding.segment,
        segment_index: finding.segmentIndex,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: finding.field,
      }),
    );
  }

  return issues;
}

function validateReferringProvider(segments: EdiSegment[], fg: number, tx: number): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const referring = firstNm1ByEntity(segments, 'DN');

  if (!referring) return issues;

  if (el(referring, 3) === '') {
    issues.push(
      issue(
        RULE_ID,
        'error',
        'Referring provider last name (NM103 in 2310A) is required when NM1*DN is present',
        GROUP,
        {
          segment: 'NM1',
          segment_index: referring.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'NM103',
        },
      ),
    );
  }

  return [...issues, ...validateProviderNpi(referring, 'Referring provider', fg, tx)];
}

export function provClmRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument, _ctx: Edi837RuleContext): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];

      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        const claims = extractClaims(body);

        for (const claim of claims) {
          const providerSegs = claimProviderSegments(claim.segments);
          issues.push(
            ...validateRenderingProvider(providerSegs, tx.functionalGroupIndex, tx.transactionSetIndex),
            ...validateServiceFacility(providerSegs, tx.functionalGroupIndex, tx.transactionSetIndex),
            ...validateReferringProvider(providerSegs, tx.functionalGroupIndex, tx.transactionSetIndex),
          );
        }
      }

      return issues;
    },
  };
}
