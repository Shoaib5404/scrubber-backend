import { Edi837ValidationRule } from '../types';
import { prov2010aaElementsRule } from './provider/prov-2010aa-elements.rule';
import { prov2010abElementsRule } from './provider/prov-2010ab-elements.rule';
import { prov2010acElementsRule } from './provider/prov-2010ac-elements.rule';
import { provBillRule } from './provider/prov-bill.rule';
import { provClmRule } from './provider/prov-clm.rule';
import { taxStructRule } from './provider/tax-struct.rule';
import { sub2010baElementsRule } from './subscriber/sub-2010ba-elements.rule';
import { subStructRule } from './subscriber/sub-struct.rule';
import { pyr2010bbElementsRule } from './payer/pyr-2010bb-elements.rule';
import { pyrStructRule } from './payer/pyr-struct.rule';
import { pat2010caElementsRule } from './patient/pat-2010ca-elements.rule';
import { patStructRule } from './patient/pat-struct.rule';

/** Laravel Chunk 2 registration order. */
export function createChunk2Rules(): Edi837ValidationRule[] {
  return [
    prov2010aaElementsRule(),
    prov2010abElementsRule(),
    prov2010acElementsRule(),
    provBillRule(),
    provClmRule(),
    taxStructRule(),
    sub2010baElementsRule(),
    subStructRule(),
    pyr2010bbElementsRule(),
    pyrStructRule(),
    pat2010caElementsRule(),
    patStructRule(),
  ];
}
