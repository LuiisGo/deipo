// Host-only cookies isolate production and each Deploy Preview session.
// Only local HTTP development may send auth cookies without TLS.
export function authCookieOptions(host: string | null, protocol: string | null) {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host ?? '');
  return { path: '/', sameSite: 'lax' as const, secure: !(local && protocol !== 'https') };
}
