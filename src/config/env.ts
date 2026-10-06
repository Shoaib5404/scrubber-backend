import { envSchema, type Env } from './env.schema';

export type { Env };

export function loadEnvFrom(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  return loadEnvFrom(raw as Record<string, unknown>);
}
