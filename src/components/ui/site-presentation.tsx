'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { SiteMode } from '@/lib/site-mode';

const PresentationContext = createContext<SiteMode>('preview');
export function SitePresentation({ mode, children }: { mode: SiteMode; children: ReactNode }) {
  return <PresentationContext.Provider value={mode}>{children}</PresentationContext.Provider>;
}
export function useSiteMode() { return useContext(PresentationContext); }
export function PreviewOnly({ children, otherwise = null }: { children: ReactNode; otherwise?: ReactNode }) {
  return useSiteMode() === 'preview' ? children : otherwise;
}
export function PresentationNotice() {
  return <PreviewOnly otherwise={<div className="presentation-notice">PRESENTACIÓN INTERNA <span>·</span> PEDIDOS NO HABILITADOS</div>}><div className="demo-banner"><span>VISTA PREVIA</span> — STOCK DE PRUEBA · PRECIO ESTIMADO · SIN PEDIDOS REALES</div></PreviewOnly>;
}
