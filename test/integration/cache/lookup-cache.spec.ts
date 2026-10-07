import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import IORedis from 'ioredis';
import { PrismaModule } from '../../../src/common/prisma/prisma.module';
import { nestGetOrLoadKey } from '../../../src/modules/cache/cache.constants';
import { LookupCacheModule } from '../../../src/modules/cache/lookup-cache.module';
import { LookupCacheService } from '../../../src/modules/cache/lookup-cache.service';
import { RedisLookupStore } from '../../../src/modules/cache/redis-lookup.store';
import { loadEnvFrom } from '../../../src/config';

/**
 * SP-5 Task 13 — lookup cache cold/warm/disabled/invalidation.
 * Requires Redis (REDIS_URL, lookup DB via REDIS_LOOKUP_DB).
 */
describe('lookup cache integration (SP-5 Task 13)', () => {
  let redis: IORedis;
  let store: RedisLookupStore;
  let cache: LookupCacheService;
  const prefix = 'lookup';
  const logicalKey = `test:task13:${Date.now()}`;

  beforeAll(async () => {
    process.env.LOOKUP_CACHE_ENABLED = 'true';
    process.env.LOOKUP_CACHE_KEY_PREFIX = prefix;
    process.env.REDIS_LOOKUP_DB = process.env.REDIS_LOOKUP_DB ?? '2';

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
              REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6381',
              REDIS_LOOKUP_DB: Number(process.env.REDIS_LOOKUP_DB ?? 2),
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
    const key = nestGetOrLoadKey(prefix, logicalKey);
    await redis.del(key);
    redis.disconnect();
  });

  it('cold miss loads then warm hit skips loader', async () => {
    const key = nestGetOrLoadKey(prefix, logicalKey);
    await redis.del(key);

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
  });

  it('disabled flag always hits loader', async () => {
    const disabledKey = `${logicalKey}:disabled`;
    let loads = 0;
    const prev = process.env.LOOKUP_CACHE_ENABLED;
    process.env.LOOKUP_CACHE_ENABLED = 'false';

    // Store reads ConfigService at call time via enabled(); ConfigModule may have cached true.
    // Force via store.enabled shim: re-check isEnabled on service using config — override by
    // calling getOrLoad while mocking isEnabled.
    const spy = jest.spyOn(cache, 'isEnabled').mockReturnValue(false);
    try {
      await cache.getOrLoad(disabledKey, async () => {
        loads += 1;
        return { n: loads };
      });
      await cache.getOrLoad(disabledKey, async () => {
        loads += 1;
        return { n: loads };
      });
      expect(loads).toBe(2);
    } finally {
      spy.mockRestore();
      process.env.LOOKUP_CACHE_ENABLED = prev;
    }
  });

  it('invalidate after successful commit forces reload', async () => {
    const invKey = `${logicalKey}:inv`;
    const redisKey = nestGetOrLoadKey(prefix, invKey);
    await redis.del(redisKey);

    let loads = 0;
    const loader = async () => {
      loads += 1;
      return { generation: loads };
    };

    await cache.getOrLoad(invKey, loader);
    expect(loads).toBe(1);

    // Simulate successful DB commit of reference data, then invalidate.
    await cache.invalidate(invKey);

    const after = await cache.getOrLoad(invKey, loader);
    expect(after).toEqual({ generation: 2 });
    expect(loads).toBe(2);
  });
});
