import {
  bodySegmentsInTransaction,
  eachTransaction,
  firstSegmentOfType,
  parseHlSegments,
  segmentsAfterNm1Until,
  subscriberLoopSegments,
} from '../../support/loop-segment-scope';
import {
  Edi837RuleContext,
  Edi837ValidationIssue,
  Edi837ValidationRule,
  EdiDocument,
  EdiSegment,
  issue,
} from '../../types';

const RULE_ID = 'SUB-STRUCT';
const GROUP = 'subscriber';

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

function validateSubscriberLoop(
  hl: { segment: EdiSegment; childCode: string },
  loopSegments: EdiSegment[],
  fg: number,
  tx: number,
): Edi837ValidationIssue[] {
  const issues: Edi837ValidationIssue[] = [];
  const sbr = firstSegmentOfType(loopSegments, 'SBR');

  if (hl.childCode === '0') {
    if (sbr && el(sbr, 2) === '') {
      issues.push(
        issue(
          RULE_ID,
          'error',
          'SBR02 subscriber relationship is required when patient is the subscriber (HL04=0)',
          GROUP,
          {
            segment: 'SBR',
            segment_index: sbr.index,
            functional_group_index: fg,
            transaction_set_index: tx,
            field: 'SBR02',
          },
        ),
      );
    }

    const subscriberNm1ForDemo = firstNm1ByEntity(loopSegments, 'IL');
    if (subscriberNm1ForDemo) {
      const baSegments = segmentsAfterNm1Until(loopSegments, subscriberNm1ForDemo, ['NM1', 'HL', 'CLM']);
      const dmg = firstSegmentOfType(baSegments, 'DMG');
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
                'Subscriber birth date (DMG02) must not be in the future',
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
    }
  }

  const subscriberNm1 = firstNm1ByEntity(loopSegments, 'IL');
  if (!subscriberNm1) {
    issues.push(
      issue(RULE_ID, 'error', 'Subscriber NM1*IL segment is required', GROUP, {
        segment: 'HL',
        segment_index: hl.segment.index,
        functional_group_index: fg,
        transaction_set_index: tx,
        field: 'NM101',
      }),
    );
  } else {
    const memberId = el(subscriberNm1, 9);
    if (memberId === '') {
      issues.push(
        issue(RULE_ID, 'error', 'Subscriber member ID (NM109) is required', GROUP, {
          segment: 'NM1',
          segment_index: subscriberNm1.index,
          functional_group_index: fg,
          transaction_set_index: tx,
          field: 'NM109',
        }),
      );
    }
  }

  return issues;
}

export function subStructRule(): Edi837ValidationRule {
  return {
    id: () => RULE_ID,
    group: () => GROUP,
    validate(doc: EdiDocument, _ctx: Edi837RuleContext): Edi837ValidationIssue[] {
      const issues: Edi837ValidationIssue[] = [];

      for (const tx of eachTransaction(doc)) {
        const body = bodySegmentsInTransaction(tx.segments);
        const hlSegments = parseHlSegments(tx.segments);

        for (const hl of hlSegments) {
          if (hl.levelCode !== '22') continue;

          const loopSegs = subscriberLoopSegments(body, hl.segment);
          issues.push(
            ...validateSubscriberLoop(hl, loopSegs, tx.functionalGroupIndex, tx.transactionSetIndex),
          );
        }
      }

      return issues;
    },
  };
}
