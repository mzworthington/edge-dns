#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const script = path.join(__dirname, 'setup-cloudflare-hosting.sh');

describe('setup-cloudflare-hosting', () => {
  it('keeps the bootstrap steps as functions instead of an embedded script', () => {
    const source = fs.readFileSync(script, 'utf8');
    assert.doesNotMatch(source, /<<'EOF'/);
    assert.match(source, /^apply_hosting\(\)/m);
    assert.match(source, /SETUP_CLOUDFLARE_HOSTING_PHASE=apply/);
  });

  it('rejects a bws zone id that does not match the domain', () => {
    const result = spawnSync(
      'bash',
      [
        '-c',
        'source "$1"; require_matching_zone_id "$2" "$3" "$4"',
        'bash',
        script,
        'example.com',
        'resolved-zone',
        'stored-zone',
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not match zone example.com/);
  });

  it('runs the checkout on PATH and treats the current directory as the product root', () => {
    const bin = path.join(__dirname, '..', 'cmd', 'setup-cloudflare-hosting');
    const source = fs.readFileSync(bin, 'utf8');
    assert.doesNotMatch(source, /curl|raw\.githubusercontent/);
    assert.match(source, /scripts\/setup-cloudflare-hosting\.sh/);

    const product = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-hosting-'));
    const result = spawnSync(bin, [], {
      cwd: product,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        BWS_ACCESS_TOKEN: 'token',
        BWS_PROJECT_ID: 'project',
        PULUMI_STACK: 'prod',
        DOMAIN: 'example.com',
      },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing infra\/cloudflare\/hosting\.yaml/);
  });

  it('reads secrets from bws and does not keep an env or dotenv fallback', () => {
    const source = fs.readFileSync(script, 'utf8');
    assert.match(source, /: "\$\{BWS_ACCESS_TOKEN:\?/);
    assert.match(source, /: "\$\{BWS_PROJECT_ID:\?/);
    assert.doesNotMatch(source, /load_dotenv/);
    assert.doesNotMatch(source, /USE_BWS=0/);
    assert.doesNotMatch(source, /CreatePersonalToken/);
    assert.doesNotMatch(source, /select_cloudflare_account_id/);
  });
});
