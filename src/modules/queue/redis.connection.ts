import { ConfigService } from '@nestjs/config';
import IORedis, { RedisOptions } from 'ioredis';

/** Shared Redis connection for BullMQ producers/workers (maxRetriesPerRequest: null required). */
export function createBullRedisConnection(config: ConfigService): IORedis {
  const url = config.get<string>('REDIS_URL', 'redis://localhost:6381');
  const tls = config.get<boolean>('REDIS_TLS', false);
  const options: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    ...(tls ? { tls: {} } : {}),
  };
  return new IORedis(url, options);
}
