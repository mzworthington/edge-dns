#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  beaconSnippet,
  injectHtml,
  htmlFilesUnder,
  siteTokenForZone,
  parseArgs,
  main,
} = require('./inject-web-analytics.cjs');

describe('beaconSnippet', () => {
  it('emits a module beacon with spa:true when requested', () => {
    const html = beaconSnippet('tok-1', true);
    assert.match(html, /static\.cloudflareinsights\.com\/beacon\.min\.js/);
    assert.match(html, /type="module"/);
    assert.match(html, /data-cf-beacon='\{"token":"tok-1","spa":true\}'/);
  });

  it('omits spa for multi-page sites', () => {
    const html = beaconSnippet('tok-1', false);
    assert.match(html, /data-cf-beacon='\{"token":"tok-1"\}'/);
    assert.doesNotMatch(html, /"spa"/);
  });

  it('loads the beacon from a first-party origin when given', () => {
    const html = beaconSnippet('tok-1', false, 'https://insights.eval-driven-development.dev');
    assert.match(html, /src="https:\/\/insights\.eval-driven-development\.dev\/beacon\.min\.js"/);
    assert.match(
      html,
      /data-cf-beacon='\{"token":"tok-1","send":\{"to":"https:\/\/insights\.eval-driven-development\.dev\/rum"\}\}'/,
    );
    assert.doesNotMatch(html, /cloudflareinsights\.com/);
  });
});

describe('injectHtml', () => {
  const shell = `<!doctype html><html><body>\n<div id="root"></div>\n</body></html>`;

  it('inserts the snippet immediately before </body>', () => {
    const { html, changed } = injectHtml(shell, 'tok-1', true);
    assert.equal(changed, true);
    assert.match(html, /beacon\.min\.js[\s\S]*<\/body>/);
    assert.doesNotMatch(html, /<\/body>[\s\S]*beacon\.min\.js/);
  });

  it('is idempotent when a beacon is already present', () => {
    const first = injectHtml(shell, 'tok-1', true).html;
    const second = injectHtml(first, 'tok-2', true);
    assert.equal(second.changed, false);
    assert.equal(second.html, first);
    assert.equal((first.match(/beacon\.min\.js/g) || []).length, 1);
  });

  it('throws when HTML has no </body>', () => {
    assert.throws(() => injectHtml('<p>hi</p>', 'tok-1', false), /<\/body>/);
  });
});

describe('htmlFilesUnder', () => {
  it('collects html files from a directory tree', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rum-html-'));
    fs.mkdirSync(path.join(dir, 'guide'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<html><body></body></html>');
    fs.writeFileSync(path.join(dir, 'guide', 'docs.html'), '<html><body></body></html>');
    fs.writeFileSync(path.join(dir, 'readme.txt'), 'nope');
    const files = htmlFilesUnder(dir).map((p) => path.relative(dir, p)).sort();
    assert.deepEqual(files, ['guide/docs.html', 'index.html']);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns a single file path as-is', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rum-file-'));
    const file = path.join(dir, 'index.html');
    fs.writeFileSync(file, '<html><body></body></html>');
    assert.deepEqual(htmlFilesUnder(file), [file]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('siteTokenForZone', () => {
  it('matches zone_tag and reads site_token', () => {
    assert.equal(
      siteTokenForZone(
        [
          { zone_tag: 'other', site_token: 'nope' },
          { zone_tag: 'zone-1', site_token: 'yes' },
        ],
        'zone-1',
      ),
      'yes',
    );
  });

  it('accepts camelCase API fields', () => {
    assert.equal(
      siteTokenForZone([{ zoneTag: 'zone-1', siteToken: 'yes' }], 'zone-1'),
      'yes',
    );
  });

  it('returns null when the zone has no site', () => {
    assert.equal(siteTokenForZone([{ zone_tag: 'other', site_token: 'x' }], 'zone-1'), null);
  });
});

describe('parseArgs', () => {
  it('parses spa, optional, and the html path after --', () => {
    assert.deepEqual(parseArgs(['node', 'inject-web-analytics.cjs', '--spa', '--', 'dist']), {
      spa: true,
      optional: false,
      token: undefined,
      beaconOrigin: undefined,
      htmlPath: 'dist',
    });
    assert.deepEqual(
      parseArgs(['node', 'inject-web-analytics.cjs', '--optional', '--token', 'abc', 'site/index.html']),
      {
        spa: false,
        optional: true,
        token: 'abc',
        beaconOrigin: undefined,
        htmlPath: 'site/index.html',
      },
    );
    assert.deepEqual(
      parseArgs([
        'node',
        'inject-web-analytics.cjs',
        '--beacon-origin',
        'https://insights.eval-driven-development.dev',
        '--',
        'dist',
      ]),
      {
        spa: false,
        optional: false,
        token: undefined,
        beaconOrigin: 'https://insights.eval-driven-development.dev',
        htmlPath: 'dist',
      },
    );
  });
});

describe('main', () => {
  it('injects using CLOUDFLARE_WEB_ANALYTICS_TOKEN without calling the API', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rum-main-'));
    const file = path.join(dir, 'index.html');
    fs.writeFileSync(file, '<!doctype html><html><body>hi</body></html>');
    const result = await main(
      ['node', 'inject-web-analytics.cjs', '--spa', '--', dir],
      { CLOUDFLARE_WEB_ANALYTICS_TOKEN: 'from-env' },
      {
        fetchSites: async () => {
          throw new Error('API should not be called');
        },
      },
    );
    assert.equal(result.exitCode, 0);
    const written = fs.readFileSync(file, 'utf8');
    assert.match(written, /"token":"from-env"/);
    assert.match(written, /"spa":true/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rewrites the beacon to a first-party origin', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rum-origin-'));
    const file = path.join(dir, 'index.html');
    fs.writeFileSync(file, '<!doctype html><html><body>hi</body></html>');
    const result = await main(
      [
        'node',
        'inject-web-analytics.cjs',
        '--beacon-origin',
        'https://insights.eval-driven-development.dev',
        '--',
        dir,
      ],
      { CLOUDFLARE_WEB_ANALYTICS_TOKEN: 'from-env' },
      {
        fetchSites: async () => {
          throw new Error('API should not be called');
        },
      },
    );
    assert.equal(result.exitCode, 0);
    const written = fs.readFileSync(file, 'utf8');
    assert.match(written, /insights\.eval-driven-development\.dev\/beacon\.min\.js/);
    assert.match(written, /insights\.eval-driven-development\.dev\/rum/);
    assert.doesNotMatch(written, /cloudflareinsights\.com/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves the token from the RUM site list for the zone', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rum-api-'));
    const file = path.join(dir, 'index.html');
    fs.writeFileSync(file, '<!doctype html><html><body>hi</body></html>');
    const result = await main(
      ['node', 'inject-web-analytics.cjs', '--', file],
      {
        CLOUDFLARE_ACCOUNT_ID: 'acct',
        CLOUDFLARE_ZONE_ID: 'zone-1',
        CLOUDFLARE_API_TOKEN: 'cf-token',
      },
      {
        fetchSites: async () => [{ zone_tag: 'zone-1', site_token: 'from-api' }],
      },
    );
    assert.equal(result.exitCode, 0);
    assert.match(fs.readFileSync(file, 'utf8'), /"token":"from-api"/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('exits 1 when the zone has no RUM site and required', async () => {
    const result = await main(
      ['node', 'inject-web-analytics.cjs', '--', 'missing.html'],
      {
        CLOUDFLARE_ACCOUNT_ID: 'acct',
        CLOUDFLARE_ZONE_ID: 'zone-1',
        CLOUDFLARE_API_TOKEN: 'cf-token',
      },
      { fetchSites: async () => [] },
    );
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /No Web Analytics site/);
  });

  it('exits 0 with a warning when optional and the zone has no RUM site', async () => {
    const result = await main(
      ['node', 'inject-web-analytics.cjs', '--optional', '--', 'missing.html'],
      {
        CLOUDFLARE_ACCOUNT_ID: 'acct',
        CLOUDFLARE_ZONE_ID: 'zone-1',
        CLOUDFLARE_API_TOKEN: 'cf-token',
      },
      { fetchSites: async () => [] },
    );
    assert.equal(result.exitCode, 0);
    assert.match(result.stderr, /skipping/);
  });
});
