import { brand } from '@/content/brand';

// Temporary text integration. Replace this component with the approved isolated SVG.
// Never extract a production logo from the raster brand board.
export function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`wordmark ${className}`} role="img" aria-label={brand.name}>deipo<span className="brand-dot">.</span></span>;
}
