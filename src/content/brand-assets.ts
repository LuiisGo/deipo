export type LogoAsset = { src: string; width: number; height: number };
// User supplied the isolated-logo PNG compositions and authorized deterministic
// margin/background removal on 2026-09-14. Geometry and original color are preserved.
// Original SVG remains preferred for future large-format use; never trace the board.
export const approvedLogo: Record<'black' | 'cream', LogoAsset | null> = {
  black: { src: '/brand/deipo-black.png', width: 688, height: 253 },
  cream: { src: '/brand/deipo-cream.png', width: 671, height: 244 },
};
