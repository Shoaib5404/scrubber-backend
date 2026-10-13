import { Edi837ValidationRule } from '../types';

import { amtStructRule } from './amount/amt-struct.rule';
import { cob2320ElementsRule } from './cob/cob-2320-elements.rule';
import { cobStructRule } from './cob/cob-struct.rule';
import { dateStructRule } from './date/date-struct.rule';
import { dxStructRule } from './diagnosis/dx-struct.rule';
import { drugStructRule } from './service-line/drug-struct.rule';
import { svc2400ElementsRule } from './service-line/svc-2400-elements.rule';
import { svcStructRule } from './service-line/svc-struct.rule';

/** Laravel Chunk 4 registration order (2320/2400 elements + amount/dx/svc/drug/date/cob structure). */
export function createChunk4Rules(): Edi837ValidationRule[] {
  return [
    cob2320ElementsRule(),
    svc2400ElementsRule(),
    amtStructRule(),
    dxStructRule(),
    svcStructRule(),
    drugStructRule(),
    dateStructRule(),
    cobStructRule(),
  ];
}
