'use client';
import Image from 'next/image';
import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useScroll, useMotionValueEvent, useInView } from 'framer-motion';
import { availablePackagingFrame, packagingSequence } from '@/lib/packaging';
import type { PackagingFrame } from '@/types/drop';

const staticQuery = '(prefers-reduced-motion: reduce), (max-height: 600px)';
const staticViewport = () => window.matchMedia(staticQuery).matches;
function subscribeViewport(callback: () => void) {
  const query = window.matchMedia(staticQuery);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}
const serverViewport = () => false;

export function PackagingReveal({ frames, children }: { frames: (string | PackagingFrame)[]; children: ReactNode }) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLElement>(null);
  // A shared server snapshot avoids replacing the section during hydration.
  const prefersStatic = useSyncExternalStore(subscribeViewport, staticViewport, serverViewport);
  const near = useInView(stage, { margin: '700px 0px', once: true });
  const [progressFrame, setProgressFrame] = useState(0);
  const [ready, setReady] = useState<Set<string>>(() => new Set());
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const sequence = packagingSequence(frames);
  const allFailed = sequence.length > 0 && sequence.every(frame => failed.has(frame.src));
  const staticMode = prefersStatic || sequence.length <= 1 || allFailed;
  const { scrollYProgress } = useScroll({ target: section, offset: ['start start', 'end end'] });
  useMotionValueEvent(scrollYProgress, 'change', value => {
    if (!staticMode) setProgressFrame(Math.min(sequence.length - 1, Math.max(0, Math.floor(value * sequence.length))));
  });
  const target = staticMode ? sequence.length - 1 : Math.min(progressFrame, sequence.length - 1);
  const active = availablePackagingFrame(target, sequence, ready, failed);
  const current = sequence[active];
  return <section ref={section} id="packaging" className="packaging-section" aria-labelledby="packaging-title" data-packaging-static={staticMode}>
    <div className="packaging-sticky page-grid">
      {children}
      <figure ref={stage} className="packaging-visual" data-packaging-mode={staticMode ? 'static' : 'sequence'} data-packaging-frame={active} data-packaging-target={target}>
        <div className="packaging-frame-heading eyebrow"><span>DEIPO / OPENING RITUAL</span><span>{current ? String(active + 1).padStart(2, '0') : '—'} / {String(sequence.length).padStart(2, '0')}</span></div>
        <div className="packaging-mask box-image">
          {active < 0 && <div className="packaging-placeholder"><span className="eyebrow">GOOD THINGS. INSIDE.</span><p>{allFailed || !sequence.length ? 'El próximo detalle está en camino.' : 'El ritual está por abrirse.'}</p></div>}
          {sequence.map((frame, index) => (index === 0 || near) && !failed.has(frame.src) && <div className="packaging-layer" key={`${index}-${frame.src}`} data-visible={index === active} aria-hidden={index !== active}>
            <Image src={frame.src} alt={index === active ? frame.alt : ''} fill sizes="(max-width: 767px) 92vw, 54vw" loading={near ? 'eager' : 'lazy'}
              onLoad={event => {
                const image = event.currentTarget;
                void image.decode().then(() => setReady(previous => new Set(previous).add(frame.src))).catch(() => setFailed(previous => new Set(previous).add(frame.src)));
              }}
              onError={() => setFailed(previous => new Set(previous).add(frame.src))} />
          </div>)}
        </div>
        <figcaption className="packaging-caption-row">
          <span className="packaging-caption eyebrow">{current?.label ?? 'EL RITUAL'}</span>
          <span className="packaging-scroll-note caption">{staticMode ? 'GOOD THINGS. INSIDE.' : 'SE ABRE CON TU SCROLL'}</span>
        </figcaption>
        <div className="packaging-progress" aria-hidden="true">{sequence.map((frame, index) => <span key={`${index}-${frame.src}`} data-complete={index <= active} />)}</div>
      </figure>
    </div>
  </section>;
}
