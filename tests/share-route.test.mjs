import test from 'node:test';
import assert from 'node:assert/strict';
import route from '../edge/share-route.mjs';

test('valid links use the static shell without exposing the token upstream', async () => {
  const originalFetch = globalThis.fetch;
  const upstreamPaths = [];
  globalThis.fetch = async url => {
    upstreamPaths.push(new URL(url).pathname);
    return new Response('<h1>shell</h1>', {
      headers: { 'Content-Type': 'text/html', ETag: 'old-value' }
    });
  };
  try {
    const token = 'A'.repeat(32);
    const response = await route.fetch(new Request(`https://share.qabas.one/f/${token}`));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '<h1>shell</h1>');
    assert.deepEqual(upstreamPaths, ['/404.html']);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
    assert.equal(response.headers.get('ETag'), null);

    const invalid = await route.fetch(new Request('https://share.qabas.one/f/invalid'));
    assert.equal(invalid.status, 404);
    const post = await route.fetch(new Request(`https://share.qabas.one/f/${token}`, { method: 'POST' }));
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('Cache-Control'), 'no-store');
    globalThis.fetch = async () => { throw new Error('origin unavailable'); };
    const unavailable = await route.fetch(new Request(`https://share.qabas.one/f/${token}`));
    assert.equal(unavailable.status, 502);
    assert.equal(unavailable.headers.get('Referrer-Policy'), 'no-referrer');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
