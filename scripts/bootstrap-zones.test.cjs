#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('bootstrap-zones.sh', () => {
  it('selects stacks without writing Pulumi config or requiring an account id', () => {
    const script = fs.readFileSync(path.join(__dirname, 'bootstrap-zones.sh'), 'utf8');
    assert.match(script, /CLOUDFLARE_API_TOKEN/);
    assert.doesNotMatch(script, /CLOUDFLARE_ACCOUNT_ID/);
    assert.doesNotMatch(script, /pulumi config set/);
    assert.match(script, /pulumi stack select/);
  });
});
