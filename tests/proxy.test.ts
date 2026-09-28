import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { AuthClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { proxy } from '../src/proxy';
import { checkoutCookieName, validCheckoutToken } from '../src/lib/deipo/checkout-session';
import { hasSupabaseSessionCookie } from '../src/lib/supabase/session-cookies';

function configureSupabase(t: TestContext) {
  const previous = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54329';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_isolated_fixture';
  t.after(() => {
    for (const [i, name] of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'].entries()) {
      if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i];
    }
  });
}

for (const path of ['/', '/checkout']) {
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
  for (const path of ['/', '/checkout']) for (const value of ['a'.repeat(64), 'invalid']) {
    const request = new NextRequest(`http://localhost${path}`, { headers: { host: 'localhost', cookie: `${checkoutCookieName}=${value}` } });
    const response = await proxy(request);
    const cookie = response.cookies.get(checkoutCookieName)!;
    assert.ok(cookie && validCheckoutToken(cookie.value));
    assert.equal(cookie.secure, false);
    if (value !== 'invalid') assert.equal(cookie.value, value);
    assert.equal(request.cookies.get(checkoutCookieName)?.value, cookie.value);
  }
});

test('session detection matches the configured project and SSR chunk format, not other auth cookies', () => {
  const url = 'https://project-ref.supabase.co';
  for (const suffix of ['', '.0', '.1', '.12']) {
    assert.equal(hasSupabaseSessionCookie([{name:`sb-project-ref-auth-token${suffix}`, value:'session'}], url), true);
  }
  for (const name of ['deipo_checkout_session', 'sb-other-auth-token', 'sb-project-ref-auth-token-code-verifier',
    'sb-project-ref-auth-token-user', 'sb-project-ref-auth-token.01', 'sb-project-ref-auth-token.foo', 'sb-project-ref-auth-token.0.extra']) {
    assert.equal(hasSupabaseSessionCookie([{name, value:'unrelated'}], url), false);
  }
  assert.equal(hasSupabaseSessionCookie([{name:'sb-project-ref-auth-token', value:''}], url), false);
  assert.equal(hasSupabaseSessionCookie([{name:'sb-127-auth-token.0', value:'session'}], 'http://127.0.0.1:54329'), true);
});

for (const path of ['/admin/login', '/admin', '/admin/orders', '/admin/drops']) {
  test(`anonymous ${path} never constructs auth, calls claims, mutates cookies or fabricates a checkout session`, async (t) => {
    configureSupabase(t);
    const claims = t.mock.method(AuthClient.prototype, 'getClaims', async () => { throw new Error('Unexpected claims'); });
    const network = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network'); });
    // Supabase construction probes WebSocket support. Count attempts even if
    // a surrounding catch would swallow an initialization error.
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket')!;
    let constructions = 0;
    Object.defineProperty(globalThis, 'WebSocket', {configurable:true, get() { constructions++; throw new Error('Unexpected Supabase construction'); }});
    t.after(() => Object.defineProperty(globalThis, 'WebSocket', descriptor));
    for (const cookie of ['', `${checkoutCookieName}=invalid`, 'sb-other-auth-token=unrelated', 'sb-127-auth-token-code-verifier=pkce']) {
      const request = new NextRequest(`https://bydeipo.com${path}`, {headers:{host:'bydeipo.com', ...(cookie ? {cookie} : {})}});
      const before = request.headers.get('cookie');
      const response = await proxy(request);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-middleware-next'), '1');
      assert.equal(response.headers.get('set-cookie'), null);
      assert.equal(request.headers.get('cookie'), before);
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    }
    assert.equal(constructions, 0);
    assert.equal(claims.mock.callCount(), 0);
    assert.equal(network.mock.callCount(), 0);
  });
}

for (const throws of [false, true]) {
  test(`existing project session invokes refresh${throws ? ' and tolerates a thrown failure' : ''} without checkout dependency`, async (t) => {
    configureSupabase(t);
    const claims = t.mock.method(AuthClient.prototype, 'getClaims', async () => {
      if (throws) throw new Error('Session refresh unavailable');
      return {data:null, error:null};
    });
    for (const path of ['/admin/login', '/admin']) for (const name of ['sb-127-auth-token', 'sb-127-auth-token.0']) {
      const request = new NextRequest(`https://bydeipo.com${path}`, {headers:{host:'bydeipo.com', cookie:`${name}=fixture; ${checkoutCookieName}=unrelated`}});
      const response = await proxy(request);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-middleware-next'), '1'); // requireAdmin still runs on protected routes.
      assert.equal(response.cookies.getAll().length, 0);
      assert.equal(request.cookies.get(checkoutCookieName)?.value, 'unrelated');
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    }
    assert.equal(claims.mock.callCount(), 4);
  });
}
