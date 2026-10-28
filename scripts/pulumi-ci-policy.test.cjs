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

  it('does not copy the API token into Pulumi stack config', () => {
    const action = fs.readFileSync(
      path.join(__dirname, '..', '.github/actions/setup-edge-dns-pulumi/action.yml'),
      'utf8',
    );
    assert.doesNotMatch(action, /pulumi config set/);
    assert.doesNotMatch(action, /cloudflare:apiToken/);
    assert.match(action, /pulumi stack select/);
    assert.match(action, /assert-stack-zone-state\.cjs/);
  });

  it('passes CLOUDFLARE_API_TOKEN to preview and apply', () => {
    const workflow = yaml.load(
      fs.readFileSync(path.join(__dirname, '..', '.github/workflows/pulumi.yml'), 'utf8'),
    );
    for (const jobName of ['preview', 'apply']) {
      const steps = workflow.jobs[jobName].steps;
      const report = steps.find((step) => String(step.uses || '').includes('pulumi-rich-report'));
      assert.ok(report, `${jobName} missing pulumi-rich-report`);
      assert.match(String(report.env.CLOUDFLARE_API_TOKEN), /secrets\.CLOUDFLARE_API_TOKEN/);
    }
  });

  it('requires the Pulumi token and API token, not the account id', () => {
    const workflow = yaml.load(
      fs.readFileSync(path.join(__dirname, '..', '.github/workflows/pulumi.yml'), 'utf8'),
    );
    const check = workflow.jobs['secrets-ready'].steps[0].run;
    assert.match(check, /PULUMI_ACCESS_TOKEN/);
    assert.match(check, /CLOUDFLARE_API_TOKEN/);
    assert.doesNotMatch(check, /CLOUDFLARE_ACCOUNT_ID/);
  });

  it('does not pass account id or zone-setting vars into stack setup', () => {
    const workflow = yaml.load(
      fs.readFileSync(path.join(__dirname, '..', '.github/workflows/pulumi.yml'), 'utf8'),
    );
    for (const jobName of ['preview', 'apply']) {
      const steps = workflow.jobs[jobName].steps;
      const setup = steps.find((step) => String(step.uses || '').includes('setup-edge-dns-pulumi'));
      assert.ok(setup, `${jobName} missing setup`);
      const envKeys = Object.keys(setup.env || {});
      assert.deepEqual(
        envKeys.filter((key) => key.startsWith('EDGE_DNS_') || key === 'CLOUDFLARE_ACCOUNT_ID'),
        [],
      );
    }
  });
});
