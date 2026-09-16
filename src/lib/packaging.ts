import type { PackagingFrame } from '@/types/drop';

export function packagingSequence(frames: (string | PackagingFrame)[]): PackagingFrame[] {
  return frames.filter(frame => (typeof frame === 'string' ? frame : frame.src).trim()).map((frame, index) => typeof frame === 'string' ? {
    src: frame,
    alt: 'Detalle de la caja deipo. negra mate, marca crema y sello naranja.',
    label: `DETALLE ${String(index + 1).padStart(2, '0')}`,
  } : frame);
}

// Keep the last usable moment while the requested image loads or if it fails.
export function availablePackagingFrame(target: number, frames: PackagingFrame[], ready: ReadonlySet<string>, failed: ReadonlySet<string>): number {
  const usable = (index: number) => ready.has(frames[index].src) && !failed.has(frames[index].src);
  for (let index = Math.min(target, frames.length - 1); index >= 0; index--) if (usable(index)) return index;
  return frames.findIndex((_, index) => usable(index));
}
