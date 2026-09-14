'use client';
import Image from 'next/image';
import { useState } from 'react';
export function Media({ src, alt, className = '', priority = false, sizes = '100vw' }: { src: string; alt: string; className?: string; priority?: boolean; sizes?: string }) {
  const [failed, setFailed] = useState(false);
  return <div className={`media ${className}`}>
    {failed ? <div className="media-fallback"><span className="eyebrow">IMAGEN NO DISPONIBLE</span><span>Lo bueno merece un momento.</span></div> :
      <Image src={src} alt={alt} fill sizes={sizes} preload={priority} onError={() => setFailed(true)} />}
  </div>;
}
