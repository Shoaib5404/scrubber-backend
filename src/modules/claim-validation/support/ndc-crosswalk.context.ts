import { ndcPairKey, normalizeHcpcs, normalizeNdcForLookup } from './ndc.helper';

/** Laravel NdcCrosswalkContext — pre-built lookup maps from crosswalk rows. */
export type NdcCrosswalkContext = {
  hcpcsRequiringNdc: Readonly<Record<string, true>>;
  knownNdcCodes: Readonly<Record<string, true>>;
  validPairs: Readonly<Record<string, true>>;
};

export type NdcCrosswalkRow = {
  hcpcs?: string | null;
  ndc?: string | null;
};

/** Laravel NdcCrosswalkContext::fromRows */
export function buildNdcCrosswalkContext(rows: readonly NdcCrosswalkRow[]): NdcCrosswalkContext {
  const hcpcsRequiringNdc: Record<string, true> = {};
  const knownNdcCodes: Record<string, true> = {};
  const validPairs: Record<string, true> = {};

  for (const row of rows) {
    const hcpcs = String(row.hcpcs ?? '')
      .trim()
      .toUpperCase();
    const ndcKey = normalizeNdcForLookup(row.ndc ?? null);

    if (hcpcs === '') {
      continue;
    }

    hcpcsRequiringNdc[hcpcs] = true;

    if (ndcKey === null) {
      continue;
    }

    knownNdcCodes[ndcKey] = true;
    validPairs[ndcPairKey(ndcKey, hcpcs)] = true;
  }

  return { hcpcsRequiringNdc, knownNdcCodes, validPairs };
}

export function emptyNdcCrosswalkContext(): NdcCrosswalkContext {
  return { hcpcsRequiringNdc: {}, knownNdcCodes: {}, validPairs: {} };
}

export function hcpcsRequiresNdc(context: NdcCrosswalkContext, hcpcs: string | null | undefined): boolean {
  const normalized = normalizeHcpcs(hcpcs);
  return normalized !== null && context.hcpcsRequiringNdc[normalized] === true;
}

export function ndcExistsInLibrary(context: NdcCrosswalkContext, ndc: string | null | undefined): boolean {
  const ndcKey = normalizeNdcForLookup(ndc);
  return ndcKey !== null && context.knownNdcCodes[ndcKey] === true;
}

export function isValidNdcHcpcsPair(
  context: NdcCrosswalkContext,
  ndc: string | null | undefined,
  hcpcs: string | null | undefined,
): boolean {
  const ndcKey = normalizeNdcForLookup(ndc);
  const hcpcsKey = normalizeHcpcs(hcpcs);
  if (ndcKey === null || hcpcsKey === null) {
    return false;
  }
  return context.validPairs[ndcPairKey(ndcKey, hcpcsKey)] === true;
}
