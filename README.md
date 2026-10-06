# Scrubber Backend

NestJS API for Neo Scrubber (EDI 837 claim scrubbing). Sibling of `scrubber-frontend` under `C:\sites\Scrubber`.

## Quick start

```bash
cp .env.example .env
docker compose up -d postgres redis
npm install
npx prisma generate
npm run start:dev
```

- API: http://localhost:3011
- Health: http://localhost:3011/health
- Swagger: http://localhost:3011/api/docs

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run start:dev` | API watch mode |
| `npm run start:worker:dev` | Worker stub |
| `npm run start:scheduler:dev` | Scheduler stub |
| `npm test` | Unit tests |
| `npm run test:e2e` | E2E tests |
| `npm run typecheck` | `tsc --noEmit` |

## Architecture notes

- Frontend never connects to Postgres/Redis — only this API does.
- Separate `worker` / `scheduler` entrypoints (stubs until Phase 6).
- Stack baseline aligned with TeleWound + scrubber migration plan.
