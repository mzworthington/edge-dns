#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  zoneSlug,
  legacyGithubPagesWwwRecordUrn,
  rumUrnsToUnprotect,
  main,
} = require('./vanity-cutover.cjs');

const RUM_URN =
  'urn:pulumi:eval-driven-development.dev::edge-dns::edge-dns:zone:ManagedZone$edge-dns:zone:GitHubPagesOrigin$cloudflare:index/webAnalyticsSite:WebAnalyticsSite::eval-driven-development-dev-github-pages-web-analytics';

describe('zoneSlug', () => {
  it('matches index.ts zoneSlug', () => {
    assert.equal(zoneSlug('eval-driven-development.dev'), 'eval-driven-development-dev');
  });
});

describe('legacyGithubPagesWwwRecordUrn', () => {
  it('names the GitHubPagesOrigin www CNAME so vanity www A can alias it', () => {
    assert.equal(
      legacyGithubPagesWwwRecordUrn(
        'eval-driven-development.dev',
        'edge-dns',
        'eval-driven-development.dev',
      ),
      'urn:pulumi:eval-driven-development.dev::edge-dns::edge-dns:zone:ManagedZone$edge-dns:zone:GitHubPagesOrigin$cloudflare:index/dnsRecord:DnsRecord::eval-driven-development-dev-github-pages-www',
    );
  });
});

describe('rumUrnsToUnprotect', () => {
  const protectedRum = {
    type: 'cloudflare:index/webAnalyticsSite:WebAnalyticsSite',
    urn: RUM_URN,
    protect: true,
  };

  it('returns protected RUM sites only when the stack is vanity', () => {
    const doc = { deployment: { resources: [protectedRum] } };
    assert.deepEqual(
      rumUrnsToUnprotect(doc, 'eval-driven-development.dev', {
        zones: { 'eval-driven-development.dev': { role: 'vanity', redirectTo: 'eval-driven.dev' } },
      }),
      [RUM_URN],
    );
  });

  it('skips product stacks so GitHub Pages RUM stays protected', () => {
    const doc = { deployment: { resources: [protectedRum] } };
    assert.deepEqual(
      rumUrnsToUnprotect(doc, 'eval-driven.dev', {
        zones: { 'eval-driven.dev': { role: 'product', githubPages: 'mzworthington.github.io' } },
      }),
      [],
    );
  });

  it('skips already-unprotected RUM', () => {
    const doc = {
      deployment: {
        resources: [{ ...protectedRum, protect: false }],
      },
    };
    assert.deepEqual(
      rumUrnsToUnprotect(doc, 'eval-driven-development.dev', {
        zones: { 'eval-driven-development.dev': { role: 'vanity', redirectTo: 'eval-driven.dev' } },
      }),
      [],
    );
  });
});

describe('main', () => {
  it('exits 2 without a stack argument', () => {
    const result = main(['node', 'vanity-cutover.cjs'], '{}', '/dev/null');
    assert.equal(result.exitCode, 2);
  });
});
