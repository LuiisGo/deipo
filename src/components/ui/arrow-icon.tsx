// Drawn interface icon: no Unicode arrow, emoji font or external icon dependency.
export function ArrowIcon({ direction = 'up-right', className = '' }: { direction?: 'up-right' | 'down' | 'left'; className?: string }) {
  const paths = {
    'up-right': 'M5 19 19 5M5 5h14v14',
    down: 'M12 3v18m-7-7 7 7 7-7',
    left: 'M21 12H3m7-7-7 7 7 7',
  };
  return <svg className={`arrow-icon ${className}`} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true" focusable="false"><path d={paths[direction]} /></svg>;
}
