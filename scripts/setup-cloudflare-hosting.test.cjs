#!/usr/bin/env node
'use strict';

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const script = path.join(__dirname, 'setup-cloudflare-hosting.sh');

function call(fn, args = [], input = '') {
  return execFileSync(
    'bash',
    [
      '-c',
      'source "$1"; shift; "$0" "$@"',
      fn,
      script,
      ...args,
    ],
    { encoding: 'utf8', input },
  ).trim();
}

describe('setup-cloudflare-hosting', () => {
  it('keeps the bootstrap steps as functions instead of an embedded script', () => {
    const source = fs.readFileSync(script, 'utf8');
    assert.doesNotMatch(source, /<<'EOF'/);
    assert.match(source, /^apply_hosting\(\)/m);
    assert.match(source, /SETUP_CLOUDFLARE_HOSTING_PHASE=apply/);
  });

  it('builds a JSON hostname list and drops blank entries', () => {
    assert.equal(
      call('pages_hostnames_json', ['app.example.com, staging.example.com, ,']),
      '["app.example.com", "staging.example.com"]',
    );
  });

  it('keeps the zone id resolved from the domain when a stored id differs', () => {
    const result = spawnSync(
      'bash',
      [
        '-c',
        'source "$1"; prefer_resolved_zone_id "$2" "$3" "$4"',
        'bash',
        script,
        'example.com',
        'resolved-zone',
        'stored-zone',
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), 'resolved-zone');
    assert.match(result.stderr, /does not match zone example.com/);
    assert.match(result.stderr, /not overwriting shared bws secret/);
  });

  it('uses the only visible Cloudflare account when no account id is set', () => {
    assert.equal(
      call('select_cloudflare_account_id', [], 'abc123\tExample account\n'),
      'abc123',
    );
  });

  it('rejects a hostname list that is only commas and spaces', () => {
    assert.throws(
      () => call('pages_hostnames_json', [', ,']),
      (error) => {
        assert.equal(error.status, 1);
        assert.match(error.stderr, /PAGES_HOSTNAMES produced an empty hostname list/);
        return true;
      },
    );
  });
});
