import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { proxy } from '../src/proxy';
import { checkoutCookieName, validCheckoutToken } from '../src/lib/deipo/checkout-session';

for (const path of ['/', '/checkout', '/admin/login', '/admin', '/admin/orders', '/admin/drops']) {
  test(`fresh custom-domain ${path} shares one checkout token with downstream and response`, async () => {
    const request = new NextRequest(`https://bydeipo.com${path}`, { headers: { host: 'bydeipo.com' } });
    const response = await proxy(request);
    const cookie = response.cookies.get(checkoutCookieName);
    assert.ok(cookie && validCheckoutToken(cookie.value));
    assert.equal(request.cookies.get(checkoutCookieName)?.value, cookie.value);
    assert.match(response.headers.get('x-middleware-request-cookie') ?? '', new RegExp(`${checkoutCookieName}=${cookie.value}`));
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.sameSite, 'lax');
    assert.equal(cookie.path, '/');
    assert.equal(cookie.domain, undefined);
  });
}

test('checkout token survives navigation and invalid tokens are replaced on localhost', async () => {
  for (const value of ['a'.repeat(64), 'invalid']) {
    const request = new NextRequest('http://localhost/admin/login', { headers: { host: 'localhost', cookie: `${checkoutCookieName}=${value}` } });
    const response = await proxy(request);
    const cookie = response.cookies.get(checkoutCookieName)!;
    assert.ok(cookie && validCheckoutToken(cookie.value));
    assert.equal(cookie.secure, false);
    if (value !== 'invalid') assert.equal(cookie.value, value);
    assert.equal(request.cookies.get(checkoutCookieName)?.value, cookie.value);
  }
});

test('a thrown claims refresh cannot abort fresh login or authorize protected routes', async (t) => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54329';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_isolated_fixture';
  const claims = t.mock.method(AuthClient.prototype, 'getClaims', async () => { throw new Error('Session refresh unavailable'); });
  try {
    for (const path of ['/admin/login', '/admin']) {
      const response = await proxy(new NextRequest(`https://bydeipo.com${path}`, { headers: { host: 'bydeipo.com' } }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-middleware-next'), '1'); // Server authorization still runs.
      assert.ok(validCheckoutToken(response.cookies.get(checkoutCookieName)?.value));
      assert.equal(response.cookies.getAll().length, 1); // No auth credentials fabricated.
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    }
    assert.equal(claims.mock.callCount(), 2);
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});
