#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('package.json', () => {
  it('is valid JSON so pnpm/action-setup can install', () => {
    const roots = [
      path.join(__dirname, '..', 'package.json'),
      path.join(__dirname, '..', 'components/zone/package.json'),
    ];
    for (const file of roots) {
      const raw = fs.readFileSync(file, 'utf8');
      assert.doesNotThrow(
        () => JSON.parse(raw),
        `${path.relative(path.join(__dirname, '..'), file)} must parse as JSON`,
      );
    }
  });
});
