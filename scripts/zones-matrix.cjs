#!/usr/bin/env node
/**
 * Emit JSON array of Pulumi stack names from zones.yaml (for CI matrix).
 * Usage: node scripts/zones-matrix.cjs
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const inventoryPath = path.join(__dirname, '..', 'zones.yaml');
const doc = yaml.load(fs.readFileSync(inventoryPath, 'utf8'));

if (!doc || typeof doc !== 'object' || !doc.zones || typeof doc.zones !== 'object') {
  console.error('zones.yaml: missing top-level `zones` map');
  process.exit(1);
}

const stacks = Object.keys(doc.zones).sort();
process.stdout.write(JSON.stringify(stacks));
