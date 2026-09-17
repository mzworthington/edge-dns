#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

describe('Pulumi TypeScript runtime', () => {
  it('pins TypeScript 6 so Pulumi ts-node can use ts.sys', () => {
    const root = path.join(__dirname, '..');
    for (const rel of ['package.json', 'components/zone/package.json']) {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
      const version = pkg.devDependencies.typescript;
      assert.match(
        version,
        /^6\./,
        `${rel} typescript must be 6.x for Pulumi runtime (got ${version}; TS 7 drops ts.sys)`,
      );
    }
    for (const rel of ['tsconfig.json', 'components/zone/tsconfig.json']) {
      const tsconfig = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
      const { module, moduleResolution } = tsconfig.compilerOptions;
      assert.equal(module, 'nodenext', `${rel} module`);
      assert.equal(moduleResolution, 'nodenext', `${rel} moduleResolution`);
    }
    const pulumiYaml = yaml.load(fs.readFileSync(path.join(root, 'Pulumi.yaml'), 'utf8'));
    assert.equal(pulumiYaml.runtime.options.typescript, true);
  });
});
