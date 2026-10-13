import { readFileSync } from 'fs';
import { join } from 'path';

type Json = Record<string, unknown>;

/** Laravel Edi837Spec::fromPath — loads edi/837p/models. */
export class Edi837Spec {
  constructor(
    private readonly master: Json,
    private readonly envelope: Json,
    private readonly loops: Json,
  ) {}

  segmentSpec(segmentCode: string): Json | null {
    const segment = this.envelope[segmentCode];
    return segment && typeof segment === 'object' ? (segment as Json) : null;
  }

  elementSpec(segmentCode: string, elementKey: string): Json | null {
    const segment = this.segmentSpec(segmentCode);
    if (!segment) return null;
    const elements = segment.elements;
    if (!elements || typeof elements !== 'object') return null;
    const element = (elements as Json)[elementKey];
    return element && typeof element === 'object' ? (element as Json) : null;
  }

  validValues(segmentCode: string, elementKey: string): string[] {
    const element = this.elementSpec(segmentCode, elementKey);
    if (!element) return [];
    const allowed = element.valid_values;
    return Array.isArray(allowed) ? (allowed as string[]) : [];
  }

  loopSpec(loopKey: string): Json | null {
    const loop = this.loops[loopKey];
    return loop && typeof loop === 'object' ? (loop as Json) : null;
  }

  loopSegmentSpec(loopKey: string, segmentCode: string): Json | null {
    const loop = this.loopSpec(loopKey);
    if (!loop) return null;
    const segments = loop.segments;
    if (!segments || typeof segments !== 'object') return null;
    const segment = (segments as Json)[segmentCode];
    return segment && typeof segment === 'object' ? (segment as Json) : null;
  }

  static fromPath(directory: string): Edi837Spec {
    const master = JSON.parse(readFileSync(join(directory, '837p_005010X222A1.json'), 'utf8')) as Json;
    const envelope = JSON.parse(readFileSync(join(directory, 'envelope.json'), 'utf8')) as Json;
    let loops = JSON.parse(readFileSync(join(directory, 'loop_1000.json'), 'utf8')) as Json;
    for (const filename of [
      'loop_2000A.json',
      'loop_2000B.json',
      'loop_2000C.json',
      'loop_2300.json',
      'loop_2310.json',
      'loop_2320.json',
      'loop_2400.json',
      'loop_2410_2420.json',
    ]) {
      try {
        const decoded = JSON.parse(readFileSync(join(directory, filename), 'utf8')) as Json;
        loops = { ...loops, ...decoded };
      } catch {
        // optional loop file
      }
    }
    return new Edi837Spec(master, envelope, loops);
  }
}
