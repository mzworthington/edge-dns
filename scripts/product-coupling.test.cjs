'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const productCoupling = /blueprint|archlens|catalogBucket|CATALOG_|R2_/i;

describe('edge-dns product coupling', () => {
  it('does not name a product, a blueprint, or an R2 catalog except the zone domain', () => {
    const root = path.join(__dirname, '..');
    const files = execFileSync('git', ['ls-files', '-z'], { cwd: root })
      .toString('utf8')
      .split('\0')
      .filter((file) => file && !file.endsWith('.test.cjs'));
    const hits = [];
    for (const file of files) {
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      const body = `${file}\n${text}`.replaceAll('archlens.dev', '');
      if (productCoupling.exec(body)) {
        hits.push(file);
      }
      productCoupling.lastIndex = 0;
    }
    assert.deepEqual(hits, []);
  });
});
