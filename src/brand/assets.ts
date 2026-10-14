import { join } from 'node:path';

/**
 * Canonical Neo Scrubber brand files on disk (copied from Laravel neo-scrubber).
 * - logo.png ← public/images/logo.png
 * - favicon.png ← public/favicon.png
 *
 * For HTML emails, prefer an absolute URL via {@link brandPublicUrl}
 * pointing at the frontend (`FRONTEND_URL/brand/...`).
 */
export const BRAND_ASSET_FILES = {
  logo: 'logo.png',
  favicon: 'favicon.png',
} as const;

export type BrandAssetFileKey = keyof typeof BRAND_ASSET_FILES;

/** Absolute filesystem directory for Nest-side brand binaries. */
export function brandAssetsDir(cwd = process.cwd()): string {
  return join(cwd, 'assets', 'brand');
}

export function brandAssetPath(
  key: BrandAssetFileKey,
  cwd = process.cwd(),
): string {
  return join(brandAssetsDir(cwd), BRAND_ASSET_FILES[key]);
}

/** Public paths mirrored on the Next.js frontend under `/public/brand`. */
export const BRAND_PUBLIC_PATHS = {
  logo: '/brand/logo.png',
  mark: '/brand/mark.png',
  favicon: '/brand/favicon.png',
} as const;

export type BrandPublicKey = keyof typeof BRAND_PUBLIC_PATHS;

export function brandPublicUrl(
  key: BrandPublicKey,
  frontendOrigin: string,
): string {
  return `${frontendOrigin.replace(/\/$/, '')}${BRAND_PUBLIC_PATHS[key]}`;
}
