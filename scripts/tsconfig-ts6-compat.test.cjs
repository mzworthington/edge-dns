#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('TypeScript 7 Pulumi compile', () => {
  it('uses TypeScript 7 with nodenext so node10 is not required', () => {
    const root = path.join(__dirname, '..');
    for (const rel of ['package.json', 'components/zone/package.json']) {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
      const version = pkg.devDependencies.typescript;
      assert.match(
        version,
        /^7\./,
        `${rel} typescript must be 7.x (got ${version})`,
      );
    }
    for (const rel of ['tsconfig.json', 'components/zone/tsconfig.json']) {
      const tsconfig = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
      const { module, moduleResolution, ignoreDeprecations } = tsconfig.compilerOptions;
      assert.equal(module, 'nodenext', `${rel} module`);
      assert.equal(moduleResolution, 'nodenext', `${rel} moduleResolution`);
      assert.equal(ignoreDeprecations, undefined, `${rel} ignoreDeprecations is a 6.0-only escape hatch`);
    }
  });
});
