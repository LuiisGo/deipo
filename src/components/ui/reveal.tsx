'use client';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { track } from '@/lib/analytics';
export function Reveal({ children, className, event }: { children: React.ReactNode; className?: string; event?: 'view_product' | 'view_price' }) {
  const reduced = useReducedMotion();
  return <LazyMotion features={domAnimation}><m.div className={className}
    initial={false} whileInView={{ opacity: 1, y: 0 }}
    onViewportEnter={() => { if (event) track(event, { drop_id: 'drop-001' }); }}
    viewport={{ once: true, amount: 0.16 }}
    transition={{ duration: reduced ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}>
    {children}
  </m.div></LazyMotion>;
}
