'use client';
import { ArrowIcon } from '@/components/ui/arrow-icon';
import { useRef, useState } from 'react';
import { LazyMotion, domAnimation, m, useReducedMotion, useScroll, useMotionValueEvent } from 'framer-motion';
import { Media } from '@/components/ui/media';
import type { PackagingFrame } from '@/types/drop';

const details = [
  { label: 'LA CAJA', scale: 1, origin: '50% 50%' },
  { label: 'EL SELLO', scale: 2.25, origin: '50% 78%' },
  { label: 'LA MARCA', scale: 2.05, origin: '50% 34%' },
  { label: 'EL RITUAL', scale: 1, origin: '50% 50%' },
];
export function PackagingReveal({ frames }: { frames: (string | PackagingFrame)[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [scrollFrame, setScrollFrame] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 25%'] });
  const sequence = frames.length > 1;
  const count = sequence ? frames.length : details.length;
  useMotionValueEvent(scrollYProgress, 'change', value => {
    if (!reduced) setScrollFrame(Math.min(count - 1, Math.floor(value * count)));
  });
  if (!frames.length) return <div className="packaging-empty caption">El próximo detalle está en camino.</div>;
  const active = Math.min(count - 1, chosen ?? (reduced ? 0 : scrollFrame));
  const asset = frames[sequence ? active : 0];
  const src = typeof asset === 'string' ? asset : asset.src;
  const alt = typeof asset === 'string' ? 'Caja deipo. negra mate, wordmark crema y sello naranja de DROP 001.' : asset.alt;
  const labels = sequence ? frames.map((frame, i) => typeof frame === 'string' ? `FOTOGRAMA ${String(i + 1).padStart(2, '0')}` : frame.label) : details.map(frame => frame.label);
  return <div ref={ref} className="packaging-visual" data-packaging-frame={active} data-packaging-mode={sequence ? 'sequence' : 'details'}>
    <div className="packaging-frame-heading eyebrow"><span>DEIPO / OBJECT STUDY</span><span>{String(active + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}</span></div>
    <div className="packaging-mask"><LazyMotion features={domAnimation}><m.div
      className="packaging-image-stage"
      animate={{ scale: sequence ? 1 : details[active].scale }}
      style={{ transformOrigin: sequence ? '50% 50%' : details[active].origin }}
      transition={{ duration: reduced ? 0 : .65, ease: [.22, 1, .36, 1] }}
    ><Media key={src} src={src} alt={alt} className="box-image" sizes="(max-width: 767px) 180vw, 100vw" /></m.div></LazyMotion></div>
    <div className="packaging-details" role="group" aria-label="Detalles del empaque">{labels.map((label, index) => <button type="button" key={`${index}-${label}`} aria-pressed={active === index} onClick={() => setChosen(index)}><span>{String(index + 1).padStart(2, '0')}</span>{label}</button>)}</div>
    <div className="packaging-caption-row"><span className="packaging-caption eyebrow">THE BOX IS OURS.<br />THE MOMENT IS YOURS.</span>{chosen !== null && !reduced && <button type="button" className="text-button" onClick={() => setChosen(null)}>SEGUIR EL SCROLL <ArrowIcon direction="down" /></button>}</div>
  </div>;
}
