import { EdiDocument, EdiSegment } from '../types';

function el(seg: EdiSegment | null | undefined, n: number): string {
  return (seg?.elements[n] ?? '').trim();
}

export type TransactionScope = {
  segments: EdiSegment[];
  functionalGroupIndex: number;
  transactionSetIndex: number;
};

/** Per ST–SE transaction with indices (Laravel AbstractEdi837TransactionRule). */
export function eachTransaction(doc: EdiDocument): TransactionScope[] {
  const out: TransactionScope[] = [];
  doc.functionalGroups.forEach((g, gi) => {
    g.transactions.forEach((tx, ti) => {
      out.push({
        segments: tx.segments,
        functionalGroupIndex: gi,
        transactionSetIndex: ti,
      });
    });
  });
  return out;
}

export type HlInfo = {
  segment: EdiSegment;
  id: string;
  parentId: string | null;
  levelCode: string;
  childCode: string;
};

/** All HL segments in a transaction body (including ST/SE list). */
export function parseHlSegments(segments: EdiSegment[]): HlInfo[] {
  const out: HlInfo[] = [];
  for (const seg of segments) {
    if (seg.id !== 'HL') continue;
    const id = el(seg, 1);
    const parentRaw = el(seg, 2);
    out.push({
      segment: seg,
      id,
      parentId: parentRaw === '' ? null : parentRaw,
      levelCode: el(seg, 3),
      childCode: el(seg, 4),
    });
  }
  return out;
}

/**
 * Segments after an HL until a stop id (exclusive). Used for 2000A/B/C hierarchy zones.
 */
export function segmentsAfterHlUntil(
  bodySegments: EdiSegment[],
  hl: EdiSegment,
  stopIds: readonly string[] = ['HL', 'CLM', 'NM1'],
): EdiSegment[] {
  const out: EdiSegment[] = [];
  let started = false;
  for (const seg of bodySegments) {
    if (!started) {
      if (seg.index === hl.index) started = true;
      continue;
    }
    if (stopIds.includes(seg.id)) break;
    out.push(seg);
  }
  return out;
}

/** Header zone before first HL (excludes ST/SE/BHT). */
export function headerSegmentsInTransaction(segments: EdiSegment[]): EdiSegment[] {
  const out: EdiSegment[] = [];
  for (const seg of segments) {
    if (seg.id === 'HL') break;
    if (seg.id === 'ST' || seg.id === 'SE' || seg.id === 'BHT') continue;
    out.push(seg);
  }
  return out;
}

export function firstSegmentOfType(segments: EdiSegment[], type: string): EdiSegment | null {
  for (const seg of segments) {
    if (seg.id === type) return seg;
  }
  return null;
}

/** Flat list of segments inside all ST…SE transaction bodies (excludes ISA/GS/GE/IEA). */
export function transactionBodySegments(doc: EdiDocument): EdiSegment[] {
  const out: EdiSegment[] = [];
  for (const g of doc.functionalGroups) {
    for (const tx of g.transactions) {
      out.push(...tx.segments);
    }
  }
  return out;
}

/** Segments before the first HL in each transaction (1000A/1000B header zone). */
export function headerSegments(doc: EdiDocument): EdiSegment[] {
  const out: EdiSegment[] = [];
  for (const g of doc.functionalGroups) {
    for (const tx of g.transactions) {
      for (const seg of tx.segments) {
        if (seg.id === 'HL') break;
        if (seg.id === 'ST' || seg.id === 'SE' || seg.id === 'BHT') continue;
        out.push(seg);
      }
    }
  }
  return out;
}

export function findNm1ByEntity(segments: EdiSegment[], entityCode: string): EdiSegment | null {
  for (const seg of segments) {
    if (seg.id === 'NM1' && el(seg, 1) === entityCode) {
      return seg;
    }
  }
  return null;
}

export function findAllNm1ByEntity(segments: EdiSegment[], entityCode: string): EdiSegment[] {
  const out: EdiSegment[] = [];
  for (const seg of segments) {
    if (seg.id === 'NM1' && el(seg, 1) === entityCode) {
      out.push(seg);
    }
  }
  return out;
}

/** Transaction body segments (excludes ST/SE). */
export function bodySegmentsInTransaction(segments: EdiSegment[]): EdiSegment[] {
  return segments.filter((s) => s.id !== 'ST' && s.id !== 'SE');
}

/** Segments after subscriber HL until next HL or CLM. */
export function subscriberLoopSegments(bodySegments: EdiSegment[], subscriberHl: EdiSegment): EdiSegment[] {
  return segmentsAfterHlUntil(bodySegments, subscriberHl, ['HL', 'CLM']);
}

/** Segments after patient HL until next HL or CLM. */
export function patientLoopSegments(bodySegments: EdiSegment[], patientHl: EdiSegment): EdiSegment[] {
  return segmentsAfterHlUntil(bodySegments, patientHl, ['HL', 'CLM']);
}

/** Segments strictly after nm1 until a stop id (exclusive). */
export function segmentsAfterNm1Until(
  segments: EdiSegment[],
  nm1: EdiSegment,
  stopIds: readonly string[] = ['NM1', 'HL', 'CLM'],
): EdiSegment[] {
  const out: EdiSegment[] = [];
  let started = false;
  for (const seg of segments) {
    if (!started) {
      if (seg.index === nm1.index) started = true;
      continue;
    }
    if (stopIds.includes(seg.id)) break;
    out.push(seg);
  }
  return out;
}

export type ParsedClaim = {
  index: number;
  clm: EdiSegment;
  segments: EdiSegment[];
};

/**
 * Claim-level 2300+2400 scope: from each CLM until the next HL (new hierarchy)
 * or next CLM. Stopping on HL prevents the next billing-provider / subscriber
 * loop from being swallowed into the previous claim's last service line.
 */
export function extractClaims(bodySegments: EdiSegment[]): ParsedClaim[] {
  const claims: ParsedClaim[] = [];
  let buffer: EdiSegment[] = [];
  let inClaim = false;

  const flush = () => {
    if (inClaim && buffer.length > 0) {
      claims.push({ index: claims.length, clm: buffer[0]!, segments: buffer });
    }
    buffer = [];
    inClaim = false;
  };

  for (const seg of bodySegments) {
    if (seg.id === 'HL') {
      flush();
      continue;
    }
    if (seg.id === 'CLM') {
      flush();
      buffer = [seg];
      inClaim = true;
      continue;
    }
    if (inClaim) {
      buffer.push(seg);
    }
  }

  flush();
  return claims;
}

export function findSegmentAfter(
  segments: EdiSegment[],
  afterIndex: number,
  type: string,
  stopAtHlLevel?: string | null,
): EdiSegment | null {
  for (const seg of segments) {
    if (seg.index <= afterIndex) continue;
    if (seg.id === 'HL' && (stopAtHlLevel == null || el(seg, 3) === stopAtHlLevel)) {
      break;
    }
    if (seg.id === type) return seg;
  }
  return null;
}

export function findRefAfter(segments: EdiSegment[], afterIndex: number, qualifiers: string[]): EdiSegment | null {
  for (const seg of segments) {
    if (seg.index <= afterIndex) continue;
    if (seg.id === 'HL' && el(seg, 3) === '22') break;
    if (seg.id === 'REF' && qualifiers.includes(el(seg, 1))) return seg;
  }
  return null;
}

/**
 * Include the NM1 itself plus following segments until a stop id is hit
 * (exclusive of the stop segment).
 */
export function nm1LoopSegments(
  segments: EdiSegment[],
  nm1: EdiSegment,
  stopIds: readonly string[] = ['NM1', 'HL', 'CLM', 'LX', 'SBR'],
): EdiSegment[] {
  const out: EdiSegment[] = [nm1];
  let started = false;
  for (const seg of segments) {
    if (!started) {
      if (seg.index === nm1.index) started = true;
      continue;
    }
    if (stopIds.includes(seg.id)) break;
    out.push(seg);
  }
  return out;
}

/** Segments belonging to an HL loop of a given level code (20/22/23), including the HL. */
export function hlLoopSegments(doc: EdiDocument, hlLevel: string): EdiSegment[] {
  const body = transactionBodySegments(doc);
  const out: EdiSegment[] = [];
  let capturing = false;
  for (const seg of body) {
    if (seg.id === 'HL') {
      if (el(seg, 3) === hlLevel) {
        capturing = true;
        out.push(seg);
        continue;
      }
      if (capturing) break;
      continue;
    }
    if (capturing) out.push(seg);
  }
  return out;
}

/** HL*20 + PRV/CUR until next HL (billing provider hierarchy only). */
export function billingHlHierarchySegments(doc: EdiDocument): EdiSegment[] {
  const body = transactionBodySegments(doc);
  const out: EdiSegment[] = [];
  let capturing = false;
  for (const seg of body) {
    if (seg.id === 'HL') {
      if (el(seg, 3) === '20') {
        capturing = true;
        out.push(seg);
        continue;
      }
      if (capturing) break;
      continue;
    }
    if (!capturing) continue;
    if (seg.id === 'NM1') break;
    if (seg.id === 'PRV' || seg.id === 'CUR') out.push(seg);
  }
  return out;
}

/** HL*22 + SBR/PAT until next HL (subscriber hierarchy). */
export function subscriberHlHierarchySegments(doc: EdiDocument): EdiSegment[] {
  const body = transactionBodySegments(doc);
  const out: EdiSegment[] = [];
  let capturing = false;
  for (const seg of body) {
    if (seg.id === 'HL') {
      if (el(seg, 3) === '22') {
        capturing = true;
        out.push(seg);
        continue;
      }
      if (capturing) break;
      continue;
    }
    if (!capturing) continue;
    if (seg.id === 'NM1' || seg.id === 'CLM') break;
    if (seg.id === 'SBR' || seg.id === 'PAT') out.push(seg);
  }
  return out;
}

/** HL*23 + PAT until next HL/CLM (patient hierarchy). */
export function patientHlHierarchySegments(doc: EdiDocument): EdiSegment[] {
  const body = transactionBodySegments(doc);
  const out: EdiSegment[] = [];
  let capturing = false;
  for (const seg of body) {
    if (seg.id === 'HL') {
      if (el(seg, 3) === '23') {
        capturing = true;
        out.push(seg);
        continue;
      }
      if (capturing) break;
      continue;
    }
    if (!capturing) continue;
    if (seg.id === 'NM1' || seg.id === 'CLM') break;
    if (seg.id === 'PAT') out.push(seg);
  }
  return out;
}

/** Claim-level 2300: from each CLM until NM1 / SBR / LX. */
export function claim2300Segments(doc: EdiDocument): EdiSegment[] {
  const body = transactionBodySegments(doc);
  const out: EdiSegment[] = [];
  let capturing = false;
  for (const seg of body) {
    if (seg.id === 'CLM') {
      capturing = true;
      out.push(seg);
      continue;
    }
    if (!capturing) continue;
    if (seg.id === 'NM1' || seg.id === 'SBR' || seg.id === 'LX') {
      capturing = false;
      continue;
    }
    out.push(seg);
  }
  return out;
}

/**
 * Claim-level 2310 provider NM1s (and trailing PRV/REF) — after CLM,
 * before LX / secondary SBR. Includes NM1 entities 82/DN/P3/QB/DQ/DK/etc.
 */
export function claim2310Segments(doc: EdiDocument): EdiSegment[] {
  const body = transactionBodySegments(doc);
  const out: EdiSegment[] = [];
  let inClaim = false;
  let in2310 = false;
  for (const seg of body) {
    if (seg.id === 'CLM') {
      inClaim = true;
      in2310 = false;
      continue;
    }
    if (!inClaim) continue;
    if (seg.id === 'LX') {
      inClaim = false;
      in2310 = false;
      continue;
    }
    if (seg.id === 'SBR') {
      // Secondary SBR (2320) ends 2310 zone for this claim.
      in2310 = false;
      continue;
    }
    if (seg.id === 'NM1') {
      in2310 = true;
      out.push(seg);
      continue;
    }
    if (in2310 && (seg.id === 'PRV' || seg.id === 'REF' || seg.id === 'N3' || seg.id === 'N4')) {
      out.push(seg);
    }
  }
  return out;
}

export type CobBlock = {
  sbr: EdiSegment;
  segments: EdiSegment[];
};

export type ClaimCobBlocks = {
  claimIndex: number;
  functionalGroupIndex: number;
  transactionSetIndex: number;
  blocks: CobBlock[];
};

/**
 * Laravel Edi837TransactionContentParser::extractCobBlocks — claim-scoped
 * 2320 blocks (first SBR after CLM through next SBR/LX).
 */
export function extractClaimCobBlocks(doc: EdiDocument): ClaimCobBlocks[] {
  const out: ClaimCobBlocks[] = [];
  for (let gi = 0; gi < doc.functionalGroups.length; gi++) {
    const g = doc.functionalGroups[gi]!;
    for (let ti = 0; ti < g.transactions.length; ti++) {
      const tx = g.transactions[ti]!;
      let claimIndex = -1;
      let claimCounter = -1;
      let capturing = false;
      let currentBlock: CobBlock | null = null;
      let blocks: CobBlock[] = [];

      const flushBlock = () => {
        if (currentBlock) {
          blocks.push(currentBlock);
          currentBlock = null;
        }
      };

      const flushClaim = () => {
        flushBlock();
        if (claimIndex >= 0 && blocks.length) {
          out.push({
            claimIndex,
            functionalGroupIndex: gi,
            transactionSetIndex: ti,
            blocks,
          });
        }
        blocks = [];
        capturing = false;
        claimIndex = -1;
      };

      for (const seg of tx.segments) {
        if (seg.id === 'HL') {
          flushClaim();
          continue;
        }
        if (seg.id === 'CLM') {
          flushClaim();
          claimCounter += 1;
          claimIndex = claimCounter;
          capturing = true;
          continue;
        }
        if (!capturing) continue;
        if (seg.id === 'LX') {
          // End COB capture at the first service line. Do not duplicate the
          // last 2320 block — that Laravel quirk invented false SBR01 uniqueness
          // and N4 required errors against X222A1 / Stedi.
          flushBlock();
          capturing = false;
          continue;
        }
        if (seg.id === 'SBR') {
          flushBlock();
          currentBlock = { sbr: seg, segments: [seg] };
          continue;
        }
        if (currentBlock) {
          currentBlock.segments.push(seg);
        }
      }
      flushClaim();
    }
  }
  return out;
}

/**
 * Secondary/tertiary COB 2320: SBR that appears after a CLM and before LX,
 * within the same claim. Reset on HL so the next claim's 2000B SBR is not
 * mistaken for COB (Laravel Loop2320 walks per parsed claim only).
 */
export function cob2320Segments(doc: EdiDocument): EdiSegment[] {
  const body = transactionBodySegments(doc);
  const out: EdiSegment[] = [];
  let seenClm = false;
  let capturing = false;
  for (const seg of body) {
    if (seg.id === 'HL') {
      seenClm = false;
      capturing = false;
      continue;
    }
    if (seg.id === 'CLM') {
      seenClm = true;
      capturing = false;
      continue;
    }
    if (seg.id === 'LX') {
      capturing = false;
      // Still inside claim until next HL/CLM; do not treat later SBRs as 2320.
      continue;
    }
    if (seenClm && seg.id === 'SBR') {
      capturing = true;
      out.push(seg);
      continue;
    }
    if (!capturing) continue;
    if (seg.id === 'NM1' && (el(seg, 1) === 'IL' || el(seg, 1) === 'PR')) {
      out.push(seg);
      continue;
    }
    if (['CAS', 'AMT', 'OI', 'MOA', 'N3', 'N4', 'DMG', 'REF', 'DTP'].includes(seg.id)) {
      out.push(seg);
    }
  }
  return out;
}

/** Service lines 2400: each LX through next LX / end of claim. */
export function serviceLine2400Segments(doc: EdiDocument): EdiSegment[] {
  const body = transactionBodySegments(doc);
  const out: EdiSegment[] = [];
  let capturing = false;
  for (const seg of body) {
    if (seg.id === 'LX') {
      capturing = true;
      out.push(seg);
      continue;
    }
    if (!capturing) continue;
    if (seg.id === 'HL' || seg.id === 'CLM') {
      capturing = false;
      continue;
    }
    out.push(seg);
  }
  return out;
}

/** 1000A submitter NM1*41 (+ PER until receiver) and 1000B NM1*40. */
export function loop1000Segments(doc: EdiDocument): {
  submitter: EdiSegment[];
  receiver: EdiSegment[];
} {
  const header = headerSegments(doc);
  let submitterNm1 = findNm1ByEntity(header, '41');
  let receiverNm1 = findNm1ByEntity(header, '40');

  // Positional fallback when NM101 is wrong (Laravel Loop1000ElementSpecRule).
  if (!submitterNm1) {
    for (const seg of header) {
      if (seg.id !== 'NM1') continue;
      if (receiverNm1 && seg.index >= receiverNm1.index) break;
      submitterNm1 = seg;
      break;
    }
  }
  if (!receiverNm1) {
    for (const seg of header) {
      if (seg.id !== 'NM1') continue;
      if (submitterNm1 && seg.index <= submitterNm1.index) continue;
      receiverNm1 = seg;
      break;
    }
  }

  const submitter: EdiSegment[] = [];
  if (submitterNm1) {
    submitter.push(submitterNm1);
    for (const seg of header) {
      if (seg.index <= submitterNm1.index) continue;
      if (receiverNm1 && seg.index >= receiverNm1.index) break;
      if (seg.id === 'PER') submitter.push(seg);
    }
  }

  const receiver: EdiSegment[] = receiverNm1 ? [receiverNm1] : [];
  return { submitter, receiver };
}

export function provider2010AaSegments(doc: EdiDocument): EdiSegment[] {
  const body = transactionBodySegments(doc);
  const nm1 = findNm1ByEntity(body, '85');
  if (!nm1) return [];
  return nm1LoopSegments(body, nm1, ['NM1', 'HL']);
}

export function provider2010AbSegments(doc: EdiDocument): EdiSegment[] {
  const body = transactionBodySegments(doc);
  const nm1 = findNm1ByEntity(body, '87');
  if (!nm1) return [];
  return nm1LoopSegments(body, nm1, ['NM1', 'HL']);
}

export function provider2010AcSegments(doc: EdiDocument): EdiSegment[] {
  const body = transactionBodySegments(doc);
  const nm1 = findNm1ByEntity(body, 'PE');
  if (!nm1) return [];
  return nm1LoopSegments(body, nm1, ['NM1', 'HL']);
}

export function subscriber2010BaSegments(doc: EdiDocument): EdiSegment[] {
  const body = transactionBodySegments(doc);
  const out: EdiSegment[] = [];
  // Each subscriber HL may have its own NM1*IL
  let inSubscriberHl = false;
  for (const seg of body) {
    if (seg.id === 'HL') {
      inSubscriberHl = el(seg, 3) === '22';
      continue;
    }
    if (!inSubscriberHl) continue;
    if (seg.id === 'HL') {
      inSubscriberHl = false;
      continue;
    }
    if (seg.id === 'NM1' && el(seg, 1) === 'IL') {
      out.push(...nm1LoopSegments(body, seg, ['NM1', 'HL', 'CLM']));
    }
  }
  // Fallback: first IL anywhere in body (patient-is-subscriber cases still have IL under 2000B)
  if (out.length === 0) {
    const nm1 = findNm1ByEntity(body, 'IL');
    if (nm1) return nm1LoopSegments(body, nm1, ['NM1', 'HL', 'CLM']);
  }
  return out;
}

export function payer2010BbSegments(doc: EdiDocument): EdiSegment[] {
  const body = transactionBodySegments(doc);
  const out: EdiSegment[] = [];
  for (const seg of body) {
    // Primary payer is under 2000B before CLM; skip post-CLM PR (2330B)
    if (seg.id === 'CLM') break;
    if (seg.id === 'NM1' && el(seg, 1) === 'PR') {
      out.push(...nm1LoopSegments(body, seg, ['NM1', 'HL', 'CLM']));
    }
  }
  return out;
}

export function patient2010CaSegments(doc: EdiDocument): EdiSegment[] {
  const body = transactionBodySegments(doc);
  const out: EdiSegment[] = [];
  for (const seg of body) {
    if (seg.id === 'NM1' && el(seg, 1) === 'QC') {
      out.push(...nm1LoopSegments(body, seg, ['NM1', 'HL', 'CLM']));
    }
  }
  return out;
}


