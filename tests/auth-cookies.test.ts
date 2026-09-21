import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authCookieOptions } from '../src/lib/supabase/cookie-options';

test('auth cookies require TLS on production and preview domains, even behind an HTTP proxy', () => {
  for (const host of ['deipo.netlify.app', 'deploy-preview-12--deipo.netlify.app', 'localhost.attacker.test', null]) {
    const options = authCookieOptions(host, 'http');
    assert.equal(options.secure, true);
    assert.equal(options.sameSite, 'lax');
    assert.equal('domain' in options, false);
  }
});
test('local development cookies work on HTTP and retain Secure on HTTPS', () => {
  for (const host of ['localhost:3001', '127.0.0.1:3002', '[::1]:3001']) {
    assert.equal(authCookieOptions(host, 'http').secure, false);
    assert.equal(authCookieOptions(host, 'https').secure, true);
  }
});
