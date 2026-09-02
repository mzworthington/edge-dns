#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  expectedZoneNameFromStack,
  strayZoneUrns,
  main,
} = require('./assert-stack-zone-state.cjs');

describe('expectedZoneNameFromStack', () => {
  it('slugs the domain the same way as index.ts', () => {
    assert.equal(
      expectedZoneNameFromStack('matthewworthington.com'),
      'matthewworthington-com-zone',
    );
    assert.equal(
      expectedZoneNameFromStack('eval-driven-development.dev'),
      'eval-driven-development-dev-zone',
    );
    assert.equal(expectedZoneNameFromStack('eval-driven.dev'), 'eval-driven-dev-zone');
  });
});

describe('strayZoneUrns', () => {
  it('accepts the stack-owned zone under ManagedZone', () => {
    const doc = {
      deployment: {
        resources: [
          {
            type: 'cloudflare:index/zone:Zone',
            urn: 'urn:pulumi:matthewworthington.com::edge-dns::edge-dns:zone:ManagedZone$cloudflare:index/zone:Zone::matthewworthington-com-zone',
          },
        ],
      },
    };
    assert.deepEqual(strayZoneUrns(doc, 'matthewworthington-com-zone'), []);
  });

  it('flags a zone imported at stack root for a different domain', () => {
    const urn =
      'urn:pulumi:matthewworthington.com::edge-dns::cloudflare:index/zone:Zone::eval-driven-development-dev-zone';
    const doc = {
      deployment: {
        resources: [
          {
            type: 'cloudflare:index/zone:Zone',
            urn: 'urn:pulumi:matthewworthington.com::edge-dns::edge-dns:zone:ManagedZone$cloudflare:index/zone:Zone::matthewworthington-com-zone',
          },
          { type: 'cloudflare:index/zone:Zone', urn },
        ],
      },
    };
    assert.deepEqual(strayZoneUrns(doc, 'matthewworthington-com-zone'), [urn]);
  });

  it('returns empty when export has no resources', () => {
    assert.deepEqual(strayZoneUrns({}, 'matthewworthington-com-zone'), []);
  });
});

describe('main', () => {
  it('prints state-delete commands and exits 1 for stray zones', () => {
    const urn =
      'urn:pulumi:matthewworthington.com::edge-dns::cloudflare:index/zone:Zone::eval-driven-development-dev-zone';
    const result = main(
      ['node', 'assert-stack-zone-state.cjs', 'matthewworthington.com'],
      JSON.stringify({
        deployment: { resources: [{ type: 'cloudflare:index/zone:Zone', urn }] },
      }),
    );
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /pulumi state delete --yes/);
    assert.match(result.stderr, /eval-driven-development-dev-zone/);
    assert.doesNotMatch(result.stderr, /pulumi destroy/);
  });

  it('exits 0 when the stack only owns its own zone', () => {
    const result = main(
      ['node', 'assert-stack-zone-state.cjs', 'matthewworthington.com'],
      JSON.stringify({
        deployment: {
          resources: [
            {
              type: 'cloudflare:index/zone:Zone',
              urn: 'urn:pulumi:matthewworthington.com::edge-dns::cloudflare:index/zone:Zone::matthewworthington-com-zone',
            },
          ],
        },
      }),
    );
    assert.equal(result.exitCode, 0);
  });
});
