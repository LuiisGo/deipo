import Image from 'next/image';
import { brand } from '@/content/brand';
import { approvedLogo } from '@/content/brand-assets';

type LogoProps = {
  variant?: 'hero' | 'navigation' | 'footer' | 'receipt' | 'compact';
  tone?: 'black' | 'cream';
  className?: string;
};
export function DeipoLogo({ variant = 'navigation', tone = 'black', className = '' }: LogoProps) {
  const asset = approvedLogo[tone];
  if (asset) return <Image src={asset.src} alt={brand.name} width={asset.width} height={asset.height} unoptimized preload={variant === 'hero' || variant === 'navigation'} className={`deipo-logo logo-${variant} ${className}`} data-logo-status="approved-png" />;
  // Existing temporary wordmark, unchanged. This is not the final brand asset.
  return <span className={`wordmark logo-${variant} logo-${tone} ${className}`} role="img" aria-label={brand.name} data-logo-status="temporary">deipo<span className="brand-dot">.</span></span>;
}
