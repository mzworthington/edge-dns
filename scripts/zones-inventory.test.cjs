#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

describe('loadZonesInventory', () => {
  it('rejects an inventory that omits the top-level accountId', async () => {
    const { loadZonesInventory } = await import('../zones.ts');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-dns-zones-'));
    const file = path.join(dir, 'zones.yaml');
    fs.writeFileSync(file, 'zones:\n  example.com:\n    role: product\n');

    assert.throws(
      () => loadZonesInventory(file),
      /zones\.yaml: missing top-level `accountId`/,
    );
  });

  it('defaults manageSettings to false when the zone omits it', async () => {
    const { inventoryManageSettings } = await import('../zones.ts');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-dns-zones-'));
    const file = path.join(dir, 'zones.yaml');
    fs.writeFileSync(
      file,
      'accountId: abc123\nzones:\n  example.com:\n    role: product\n',
    );

    assert.equal(inventoryManageSettings('example.com', file), false);
  });

  it('loads the repo inventory accountId', async () => {
    const { loadZonesInventory } = await import('../zones.ts');
    const inventory = loadZonesInventory();
    assert.match(inventory.accountId, /^[a-f0-9]{32}$/);
  });

  it('resolves a stack from the inventory, including manageSettings when true', async () => {
    const { edgeStackSettings } = await import('../zones.ts');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-dns-zones-'));
    const file = path.join(dir, 'zones.yaml');
    fs.writeFileSync(
      file,
      [
        'accountId: abcdef0123456789abcdef0123456789',
        'zones:',
        '  example.com:',
        '    role: product',
        '    manageSettings: true',
        '  other.com:',
        '    role: vanity',
        '    redirectTo: example.com',
        '',
      ].join('\n'),
    );

    assert.deepEqual(edgeStackSettings('example.com', file), {
      accountId: 'abcdef0123456789abcdef0123456789',
      zoneName: 'example.com',
      manageSettings: true,
    });
  });
});

describe('index.ts stack settings', () => {
  it('takes accountId, zoneName, and manageSettings from the inventory', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8');
    assert.match(source, /edgeStackSettings\(pulumi\.getStack\(\)\)/);
    assert.doesNotMatch(source, /config\.require\('accountId'\)/);
    assert.doesNotMatch(source, /config\.require\('zoneName'\)/);
    assert.doesNotMatch(source, /config\.getBoolean\('manageSettings'\)/);
  });
});
