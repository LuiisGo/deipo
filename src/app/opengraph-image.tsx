import { ImageResponse } from 'next/og';
export const alt = 'deipo. — Limited food drops by chefs. Guatemala City.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export default function OpenGraphImage() { return new ImageResponse(<div style={{ width: '100%', height: '100%', background: '#F5F1E8', color: '#121212', padding: 64, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}><div style={{ display: 'flex', fontSize: 170, letterSpacing: '-12px' }}>deipo<span style={{ color: '#D3401F' }}>.</span></div><div style={{ display: 'flex', flexDirection: 'column', gap: 22, borderTop: '1px solid #121212', paddingTop: 34 }}><span style={{ fontSize: 20, letterSpacing: '5px' }}>LIMITED FOOD DROPS BY CHEFS</span><span style={{ fontSize: 64 }}>SUNDAY ROAST</span><span style={{ fontSize: 18, letterSpacing: '3px' }}>DROP 001 / GUATEMALA CITY / PRE-LAUNCH PREVIEW</span></div></div>, size); }
