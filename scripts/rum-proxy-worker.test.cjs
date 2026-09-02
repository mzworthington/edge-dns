'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const ALLOWED = ['https://waykit.dev', 'https://www.waykit.dev'];

describe('grey-cloud snippet', () => {
  it('loads the beacon first-party and does not override send.to', async () => {
    const { greyCloudBeaconSnippet } = await import('../components/zone/rum-proxy-worker.mjs');
    const snippet = greyCloudBeaconSnippet('insights.waykit.dev', 'tok-1');
    assert.match(snippet, /insights\.waykit\.dev\/beacon\.min\.js/);
    assert.doesNotMatch(snippet, /"send"/);
    assert.doesNotMatch(snippet, /\/rum/);
  });
});

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
      new Request('https://insights.waykit.dev/beacon.min.js', {
        headers: { Origin: 'https://waykit.dev' },
      }),
      ALLOWED,
      fetchImpl,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://waykit.dev');
    assert.equal(await response.text(), 'beacon-js');
  });

  it('forwards RUM posts and rejects other origins', async () => {
    const { rumProxyFetch, RUM_URL } = await import('../components/zone/rum-proxy-worker.mjs');
    const fetchImpl = async (url, init) => {
      assert.equal(url, `${RUM_URL}?v=1`);
      assert.equal(init.method, 'POST');
      assert.equal(init.headers.get('origin'), 'https://waykit.dev');
      assert.equal(init.headers.get('user-agent'), 'Mozilla/5.0');
      assert.equal(init.headers.get('CF-Connecting-IP'), '203.0.113.9');
      return new Response(null, { status: 204 });
    };
    const ok = await rumProxyFetch(
      new Request('https://insights.waykit.dev/rum?v=1', {
        method: 'POST',
        headers: {
          Origin: 'https://waykit.dev',
          'content-type': 'text/plain;charset=UTF-8',
          'user-agent': 'Mozilla/5.0',
          'CF-Connecting-IP': '203.0.113.9',
        },
        body: '{}',
      }),
      ALLOWED,
      fetchImpl,
    );
    assert.equal(ok.status, 204);

    const denied = await rumProxyFetch(
      new Request('https://insights.waykit.dev/rum', {
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
      new Request('https://insights.waykit.dev/rum', {
        method: 'OPTIONS',
        headers: { Origin: 'https://waykit.dev' },
      }),
      ALLOWED,
    );
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, HEAD, POST, OPTIONS');
  });
});
