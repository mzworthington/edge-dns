#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('setup-pulumi-cloudflare', () => {
  it('keeps applying Pages config from the environment when hosting.yaml has no pages project', () => {
    const action = fs.readFileSync(
      path.join(__dirname, '..', '.github/actions/setup-pulumi-cloudflare/action.yml'),
      'utf8',
    );
    assert.match(action, /read_hosting pagesProjectName/);
    assert.match(action, /file_pages/);
    assert.match(action, /pulumi config set pagesProjectName/);
  });

  it('does not take the account id or zone id from GitHub secrets', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '..', '.github/workflows/product-pulumi-cloudflare.yml'),
      'utf8',
    );
    assert.doesNotMatch(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/);
    assert.doesNotMatch(workflow, /secrets\.CLOUDFLARE_ZONE_ID/);
  });

  it('does not store the account id or zone id as a GitHub secret', () => {
    const script = fs.readFileSync(path.join(__dirname, 'setup-cloudflare-hosting.sh'), 'utf8');
    assert.doesNotMatch(script, /gh secret set CLOUDFLARE_ACCOUNT_ID/);
    assert.doesNotMatch(script, /gh secret set CLOUDFLARE_ZONE_ID/);
  });
});
