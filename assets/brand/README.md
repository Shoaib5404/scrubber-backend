# Brand binaries (Nest)

Copied from Laravel `neo-scrubber`:

- `logo.png` ← `public/images/logo.png`
- `favicon.png` ← `public/favicon.png`

Runtime email HTML loads the **public** copies from the Next app via `FRONTEND_URL` + `/brand/logo.png` (see `src/brand/assets.ts`). Keep these files in sync when the brand updates.
