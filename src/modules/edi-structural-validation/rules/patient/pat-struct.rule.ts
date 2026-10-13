import {
  bodySegmentsInTransaction,
  eachTransaction,
  firstSegmentOfType,
  parseHlSegments,
  patientLoopSegments,
  segmentsAfterNm1Until,
} from '../../support/loop-segment-scope';
import {
  Edi837RuleContext,
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../../types';

const RULE_ID = 'PAT-STRUCT';
const GROUP = 'patient';

function el(seg: EdiSegment, n: number): string {
  return (seg.elements[n] ?? '').trim();
}

function firstNm1ByEntity(segments: EdiSegment[], entityCode: string): EdiSegment | null {
  for (const segment of segments) {
    if (segment.id === 'NM1' && el(segment, 1) === entityCode) return segment;
  }
  return null;
}

function isValidDate(value: string): boolean {
  if (value.length !== 8 || !/^\d{8}$/.test(value)) return false;
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(4, 6));
  const d = Number(value.slice(6, 8));
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return (
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() === m - 1 &&
    parsed.getUTCDate() === d
  );
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function findPatientHl(hlSegments: ReturnType<typeof parseHlSegments>, subscriberHl: { id: string }) {
  for (const hl of hlSegments) {
    if (hl.levelCode === '23' && hl.parentId === subscriberHl.id) {
      return hl;
    }
  }
  return null;
}

function validatePatientLoop(
  patientHl: { segment: EdiSegment },
  bodySegments: EdiSegment[],
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const loopSegments = patientLoopSegments(bodySegments, patientHl.segment);

  const patientNm1 = firstNm1ByEntity(loopSegments, 'QC');
  if (!patientNm1) {
    issues.push(
      issue(RULE_ID, 'error', 'Patient NM1*QC segment (loop 2010CA) is required', GROUP, {
        segment: 'HL',
        segment_index: patientHl.segment.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'NM101',
      }),
    );
    return issues;
  }

  const afterNm1 = segmentsAfterNm1Until(loopSegments, patientNm1, ['NM1', 'HL', 'CLM']);
  const dmg = firstSegmentOfType(afterNm1, 'DMG');
  if (dmg) {
    const birthDate = el(dmg, 2);
    if (birthDate !== '' && isValidDate(birthDate)) {
      const y = Number(birthDate.slice(0, 4));
      const m = Number(birthDate.slice(4, 6));
      const d = Number(birthDate.slice(6, 8));
      const parsed = new Date(Date.UTC(y, m - 1, d));
      if (parsed > startOfTodayUtc()) {
        issues.push(
          issue(
            RULE_ID,
            'error',
            'Patient birth date (DMG02 in 2010CA) must not be in the future',
            GROUP,
            {
              segment: 'DMG',
              segment_index: dmg.index,
              functional_group_index: fg,
              transaction_set_index: tx,
              field: 'DMG02',
            },
          ),
        );
      }
    }
  }

  return issues;
}

export function patStructRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument, _ctx: Edi837RuleContext): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];

      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        const hlSegments = parseHlSegments(tx.segments);

        for (const hl of hlSegments) {
          if (hl.levelCode !== '22' || hl.childCode !== '1') continue;

          if (findPatientHl(hlSegments, hl) === null) {
            issues.push(
              issue(
                RULE_ID,
                'error',
                'Patient hierarchical level (2000C, HL03=23) is required when subscriber is not the patient (HL04=1)',
                GROUP,
                {
                  segment: 'HL',
                  segment_index: hl.segment.index,
                  functional_group_index: tx.functionalGroupIndex,
                  transaction_set_index: tx.transactionSetIndex,
                  field: 'HL04',
                },
              ),
            );
          }
        }

        for (const hl of hlSegments) {
          if (hl.levelCode !== '23') continue;
          issues.push(
            ...validatePatientLoop(hl, body, tx.functionalGroupIndex, tx.transactionSetIndex),
          );
        }
      }

      return issues;
    },
  };
}
