'use client';
import { useRef } from 'react';
import { LazyMotion, domAnimation, m, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { Media } from '@/components/ui/media';
// Ordered frames are the integration point for approved opening/seal/interior assets.
// The current one-frame art direction intentionally stays a photographic reveal.
export function PackagingReveal({ frames }: { frames: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [22, -22]);
  return <div ref={ref} className="packaging-visual"><LazyMotion features={domAnimation}><m.div style={reduced ? undefined : { y }}>
    <Media src={frames[0]} alt="deipo. matte black box with cream wordmark and orange DROP 001 security seal. Packaging concept." className="box-image" sizes="(max-width: 767px) 100vw, 58vw" />
  </m.div></LazyMotion><span className="packaging-caption eyebrow">THE BOX IS OURS. THE MOMENT IS YOURS.</span></div>;
}
