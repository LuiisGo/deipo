'use client';
export default function AdminError({reset}: {reset:()=>void}) { return <main id="main" className="admin-root admin-workspace"><h1>No pudimos cargar el Admin</h1><p>Revisá tu conexión o iniciá sesión nuevamente.</p><button className="admin-button" onClick={reset}>Reintentar</button><a href="/admin/login">Iniciar sesión</a></main>; }
