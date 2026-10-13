import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import IORedis from 'ioredis';
import { PrismaModule } from '../../../src/common/prisma/prisma.module';
import {
  lookupChunkMetaKey,
  lookupV1Key,
} from '../../../src/modules/cache/cache.constants';
import { LookupCacheModule } from '../../../src/modules/cache/lookup-cache.module';
import { LookupCacheService } from '../../../src/modules/cache/lookup-cache.service';
import { RedisLookupStore } from '../../../src/modules/cache/redis-lookup.store';
import { loadEnvFrom } from '../../../src/config';

/**
 * Nest-native lookup cache — cold/warm/disabled/chunking/invalidation on Redis DB 1.
 */
describe('lookup cache integration (Nest v1 + chunks)', () => {
  let redis: IORedis;
  let store: RedisLookupStore;
  let cache: LookupCacheService;
  const prefix = 'lookup';
  const logicalKey = `test:task13:${Date.now()}`;

  beforeAll(async () => {
    process.env.LOOKUP_CACHE_ENABLED = 'true';
    process.env.LOOKUP_CACHE_KEY_PREFIX = prefix;
    process.env.REDIS_LOOKUP_DB = process.env.REDIS_LOOKUP_DB ?? '1';
    process.env.LOOKUP_CACHE_CHUNK_BYTES = '256';

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: (config) =>
            loadEnvFrom({
              ...config,
              DATABASE_URL:
                process.env.DATABASE_URL ??
                'postgresql://scrubber:scrubber@localhost:5433/scrubber?schema=public',
              JWT_SECRET: process.env.JWT_SECRET ?? 'change-me-in-production-min-32-chars',
              JWT_REFRESH_SECRET:
                process.env.JWT_REFRESH_SECRET ?? 'change-me-refresh-in-production-min-32',
              LOOKUP_CACHE_ENABLED: true,
              LOOKUP_CACHE_KEY_PREFIX: prefix,
              LOOKUP_CACHE_CHUNK_BYTES: 256,
              REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6381',
              REDIS_LOOKUP_DB: Number(process.env.REDIS_LOOKUP_DB ?? 1),
            }),
        }),
        PrismaModule,
        LookupCacheModule,
      ],
    }).compile();

    store = moduleRef.get(RedisLookupStore);
    cache = moduleRef.get(LookupCacheService);
    redis = store.raw();
  });

  afterAll(async () => {
    await cache.invalidate(logicalKey);
    await cache.invalidate(`${logicalKey}:chunked`);
    redis.disconnect();
  });

  it('uses lookup Redis DB 1 by default', () => {
    expect(store.dbIndex()).toBe(1);
  });

  it('cold miss loads then warm hit skips loader', async () => {
    await cache.invalidate(logicalKey);

    let loads = 0;
    const loader = async () => {
      loads += 1;
      return { value: 42, codes: ['99213'] };
    };

    const cold = await cache.getOrLoad(logicalKey, loader);
    expect(cold).toEqual({ value: 42, codes: ['99213'] });
    expect(loads).toBe(1);

    const warm = await cache.getOrLoad(logicalKey, loader);
    expect(warm).toEqual({ value: 42, codes: ['99213'] });
    expect(loads).toBe(1);

    const raw = await redis.get(lookupV1Key(prefix, logicalKey));
    expect(raw).toBeTruthy();
    const envelope = JSON.parse(raw as string);
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.data).toEqual({ value: 42, codes: ['99213'] });
  });

  it('chunks large array payloads across __meta + __chunk:N', async () => {
    const bigKey = `${logicalKey}:chunked`;
    await cache.invalidate(bigKey);

    const rows = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      column1: `A${i}`,
      column2: `B${i}`,
      modifier: 0,
    }));

    const loaded = await cache.getOrLoad(bigKey, async () => rows);
    expect(loaded).toHaveLength(40);

    const single = await redis.get(lookupV1Key(prefix, bigKey));
    const meta = await redis.get(lookupChunkMetaKey(prefix, bigKey));
    expect(single).toBeNull();
    expect(meta).toBeTruthy();
    const metaEnv = JSON.parse(meta as string);
    expect(metaEnv.chunked).toBe(true);
    expect(metaEnv.chunkCount).toBeGreaterThan(1);

    const again = await cache.getOrLoad(bigKey, async () => {
      throw new Error('should not reload');
    });
    expect(again).toHaveLength(40);
  });

  it('invalidate removes logical keys', async () => {
    const invKey = `${logicalKey}:inv`;
    await cache.getOrLoad(invKey, async () => ({ ok: true }));
    expect(await redis.get(lookupV1Key(prefix, invKey))).toBeTruthy();
    await cache.invalidate(invKey);
    expect(await redis.get(lookupV1Key(prefix, invKey))).toBeNull();
  });

  it('disabled cache always hits loader', async () => {
    const prev = process.env.LOOKUP_CACHE_ENABLED;
    process.env.LOOKUP_CACHE_ENABLED = 'false';
    // store.enabled reads ConfigService — use getOrLoad when isEnabled false via config mock:
    // ConfigService already loaded; toggle via spy.
    const spy = jest.spyOn(cache, 'isEnabled').mockReturnValue(false);
    let loads = 0;
    await cache.getOrLoad(`${logicalKey}:bypass`, async () => {
      loads += 1;
      return 1;
    });
    await cache.getOrLoad(`${logicalKey}:bypass`, async () => {
      loads += 1;
      return 1;
    });
    expect(loads).toBe(2);
    spy.mockRestore();
    process.env.LOOKUP_CACHE_ENABLED = prev;
  });
});
