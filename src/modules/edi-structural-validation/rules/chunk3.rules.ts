import { Edi837ValidationRule } from '../types';
import { clm2300ElementsRule } from './claim/clm-2300-elements.rule';
import { clmStructRule } from './claim/clm-struct.rule';
import { nteStructRule } from './claim/nte-struct.rule';
import { refStructRule } from './claim/ref-struct.rule';
import { prov2310ElementsRule } from './provider/prov-2310-elements.rule';

/** Laravel Chunk 3 registration order (2300/2310 elements + CLM/REF/NTE structure). */
export function createChunk3Rules(): Edi837ValidationRule[] {
  return [
    clm2300ElementsRule(),
    prov2310ElementsRule(),
    clmStructRule(),
    refStructRule(),
    nteStructRule(),
  ];
}
