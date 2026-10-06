import { loadEnvFrom } from './env';

describe('loadEnvFrom', () => {
  it('throws when DATABASE_URL is missing', () => {
    expect(() =>
      loadEnvFrom({
        NODE_ENV: 'test',
        PORT: '3011',
        CORS_ORIGINS: 'http://localhost:3010',
        JWT_SECRET: 'change-me-in-production-min-32-chars',
        JWT_REFRESH_SECRET: 'change-me-refresh-in-production-min-32',
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it('parses a valid env object', () => {
    const env = loadEnvFrom({
      NODE_ENV: 'development',
      PORT: '3011',
      CORS_ORIGINS: 'http://localhost:3010',
      LOG_LEVEL: 'debug',
      DATABASE_URL:
        'postgresql://scrubber:scrubber@localhost:5433/scrubber?schema=public&connection_limit=10',
      DATABASE_SSL: 'false',
      REDIS_URL: 'redis://localhost:6381',
      REDIS_TLS: 'false',
      BULLMQ_CONCURRENCY: '5',
      QUEUE_MODE: 'bullmq',
      JWT_SECRET: 'change-me-in-production-min-32-chars',
      JWT_REFRESH_SECRET: 'change-me-refresh-in-production-min-32',
      JWT_ACCESS_TTL: '15',
      JWT_REFRESH_TTL: '30',
      JWT_ISSUER: 'neo-scrubber',
      JWT_AUDIENCE: 'neo-scrubber-api',
      EDI_MAX_BYTES: '26214400',
      EDI_LOCAL_PATH: './storage/edi',
      FRONTEND_URL: 'http://localhost:3010',
    });

    expect(env.PORT).toBe(3011);
    expect(env.DATABASE_URL).toContain('5433');
    expect(env.BULLMQ_CONCURRENCY).toBe(5);
  });
});
