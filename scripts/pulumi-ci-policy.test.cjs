#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

describe('pulumi.yml Dependabot secret gate', () => {
  it('skips preview when Pulumi secrets are not ready', () => {
    const workflow = yaml.load(
      fs.readFileSync(path.join(__dirname, '..', '.github/workflows/pulumi.yml'), 'utf8'),
    );
    assert.ok(workflow.jobs['secrets-ready']);
    assert.deepEqual(workflow.jobs.preview.needs, ['matrix', 'secrets-ready']);
    assert.equal(String(workflow.jobs.preview.if).trim(), "needs.secrets-ready.outputs.ready == 'true'");
  });
});
