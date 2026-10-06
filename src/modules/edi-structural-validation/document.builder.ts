import { EdiDocument, EdiSegment } from './types';

export class EdiDocumentBuilder {
  build(content: string): EdiDocument {
    if (content.length < 106 || !content.startsWith('ISA')) {
      throw new Error('EDI content too short to contain valid ISA segment');
    }
    const elementSeparator = content[3];
    const componentSeparator = content[104];
    const segmentTerminator = content[105];
    const normalized = content.replace(/\r\n|\r|\n/g, '');
    const rawSegments = normalized
      .split(segmentTerminator)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const segments: EdiSegment[] = rawSegments.map((raw, index) => {
      const elements = raw.split(elementSeparator);
      return { id: elements[0] ?? '', elements, index, raw };
    });

    const isa = segments.find((s) => s.id === 'ISA') ?? null;
    const iea = segments.find((s) => s.id === 'IEA') ?? null;
    const functionalGroups: EdiDocument['functionalGroups'] = [];
    let currentGroup: EdiDocument['functionalGroups'][number] | null = null;
    let currentTx: EdiDocument['functionalGroups'][number]['transactions'][number] | null = null;

    for (const seg of segments) {
      if (seg.id === 'GS') {
        currentGroup = { gs: seg, ge: null, transactions: [] };
        functionalGroups.push(currentGroup);
        currentTx = null;
      } else if (seg.id === 'GE' && currentGroup) {
        currentGroup.ge = seg;
      } else if (seg.id === 'ST' && currentGroup) {
        currentTx = { st: seg, se: null, segments: [seg] };
        currentGroup.transactions.push(currentTx);
      } else if (seg.id === 'SE' && currentTx) {
        currentTx.se = seg;
        currentTx.segments.push(seg);
      } else if (currentTx) {
        currentTx.segments.push(seg);
      }
    }

    return { segments, elementSeparator, segmentTerminator, componentSeparator, isa, iea, functionalGroups };
  }
}
