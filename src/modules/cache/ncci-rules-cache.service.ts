import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NCCI_FULL_TABLE_CACHE_NAME } from './cache.constants';
import { LookupCacheService } from './lookup-cache.service';

export type CachedNcciPair = {
  id: number;
  column1: string;
  column2: string;
  modifier: number;
};

/**
 * NCCI pair lookup — below NCCI_CLAIM_CPT_DB_THRESHOLD: indexed Postgres query.
 * Above threshold: Nest lookup cache key `nccis:full:active` (auto-chunked when large).
 */
@Injectable()
export class NcciRulesCacheService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookupCache: LookupCacheService,
    private readonly config: ConfigService,
  ) {}

  threshold(): number {
    return this.config.get<number>('NCCI_CLAIM_CPT_DB_THRESHOLD', 48);
  }

  async pairsByColumnKey(codes: string[]): Promise<Record<string, CachedNcciPair[]>> {
    const unique = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
    if (unique.length < 2) return {};

    const rows =
      unique.length <= this.threshold()
        ? await this.loadFromDb(unique)
        : await this.loadFromCacheFiltered(unique);

    const out: Record<string, CachedNcciPair[]> = {};
    for (const r of rows) {
      const key = `${r.column1}|${r.column2}`;
      (out[key] ??= []).push(r);
    }
    return out;
  }

  async invalidateFullTable(): Promise<void> {
    await this.lookupCache.invalidate(NCCI_FULL_TABLE_CACHE_NAME);
  }

  /** Force reload of full active NCCI snapshot into Redis (chunked if needed). */
  async warmFullTable(): Promise<CachedNcciPair[]> {
    await this.invalidateFullTable();
    return this.getFullTable();
  }

  /** Read-through: loads + caches the full table on a miss. */
  async getFullTable(): Promise<CachedNcciPair[]> {
    return this.lookupCache.getOrLoad(NCCI_FULL_TABLE_CACHE_NAME, () => this.loadFullActiveTable());
  }

  /** Inspect without warming; null means cache miss. */
  async peekFullTable(): Promise<CachedNcciPair[] | null> {
    return this.lookupCache.peek<CachedNcciPair[]>(NCCI_FULL_TABLE_CACHE_NAME);
  }

  private async loadFromCacheFiltered(codes: string[]): Promise<CachedNcciPair[]> {
    const all = await this.lookupCache.getOrLoad(NCCI_FULL_TABLE_CACHE_NAME, () =>
      this.loadFullActiveTable(),
    );
    const set = new Set(codes);
    return all.filter((r) => set.has(r.column1) && set.has(r.column2));
  }

  private async loadFromDb(codes: string[]): Promise<CachedNcciPair[]> {
    const rows = await this.prisma.ncci.findMany({
      where: {
        isActive: true,
        column1: { in: codes },
        column2: { in: codes },
      },
      select: { id: true, column1: true, column2: true, modifier: true },
      orderBy: { id: 'asc' },
    });
    return rows;
  }

  private async loadFullActiveTable(): Promise<CachedNcciPair[]> {
    return this.prisma.ncci.findMany({
      where: { isActive: true },
      select: { id: true, column1: true, column2: true, modifier: true },
      orderBy: { id: 'asc' },
    });
  }
}
