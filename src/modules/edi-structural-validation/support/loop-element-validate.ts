import type { Edi837RuleContext, Edi837ValidationIssue, EdiSegment } from '../types';

export function validateLoopSegmentElements(
  ctx: Edi837RuleContext,
  segment: EdiSegment,
  loopKey: string,
  segmentSpecKey: string,
  ruleId: string,
  category: string,
  functionalGroupIndex: number,
  transactionSetIndex: number,
  ediSegmentCode?: string,
): Edi837ValidationIssue[] {
  const segmentSpec = ctx.spec.loopSegmentSpec(loopKey, segmentSpecKey);
  if (!segmentSpec) {
    return [];
  }

  return ctx.elements.validateSegment(
    segment,
    ediSegmentCode ?? segmentSpecKey,
    segmentSpec,
    ruleId,
    category,
    functionalGroupIndex,
    transactionSetIndex,
  );
}
