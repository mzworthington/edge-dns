'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const ALLOWED = ['https://eval-driven-development.dev', 'https://www.eval-driven-development.dev'];

describe('rumProxyFetch', () => {
  it('proxies the beacon JS for an allowed origin', async () => {
    const { rumProxyFetch, BEACON_URL } = await import('../components/zone/rum-proxy-worker.mjs');
    const fetchImpl = async (url) => {
      assert.equal(url, BEACON_URL);
      return new Response('beacon-js', {
        status: 200,
        headers: { 'Content-Type': 'text/javascript;charset=UTF-8' },
      });
    };
    const response = await rumProxyFetch(
      new Request('https://insights.eval-driven-development.dev/beacon.min.js', {
        headers: { Origin: 'https://eval-driven-development.dev' },
      }),
      ALLOWED,
      fetchImpl,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://eval-driven-development.dev');
    assert.equal(await response.text(), 'beacon-js');
  });

  it('forwards RUM posts and rejects other origins', async () => {
    const { rumProxyFetch, RUM_URL } = await import('../components/zone/rum-proxy-worker.mjs');
    const fetchImpl = async (url, init) => {
      assert.equal(url, `${RUM_URL}?v=1`);
      assert.equal(init.method, 'POST');
      assert.equal(init.headers.get('origin'), 'https://eval-driven-development.dev');
      return new Response('ok', { status: 204 });
    };
    const ok = await rumProxyFetch(
      new Request('https://insights.eval-driven-development.dev/cdn-cgi/rum?v=1', {
        method: 'POST',
        headers: {
          Origin: 'https://eval-driven-development.dev',
          'content-type': 'text/plain;charset=UTF-8',
        },
        body: '{}',
      }),
      ALLOWED,
      fetchImpl,
    );
    assert.equal(ok.status, 204);

    const denied = await rumProxyFetch(
      new Request('https://insights.eval-driven-development.dev/cdn-cgi/rum', {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
        body: '{}',
      }),
      ALLOWED,
      async () => {
        throw new Error('must not forward');
      },
    );
    assert.equal(denied.status, 403);
  });

  it('answers CORS preflight', async () => {
    const { rumProxyFetch } = await import('../components/zone/rum-proxy-worker.mjs');
    const response = await rumProxyFetch(
      new Request('https://insights.eval-driven-development.dev/cdn-cgi/rum', {
        method: 'OPTIONS',
        headers: { Origin: 'https://eval-driven-development.dev' },
      }),
      ALLOWED,
    );
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, HEAD, POST, OPTIONS');
  });
});
