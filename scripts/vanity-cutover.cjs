#!/usr/bin/env node
/**
 * Helpers for githubPages → vanity cutover.
 *
 * Usage (CI, after stack select):
 *   pulumi stack export --stack <domain> | node scripts/vanity-cutover.cjs <domain>
 *
 * Prints protected WebAnalyticsSite URNs (one per line) when the stack is vanity
 * so the apply job can `pulumi state unprotect` before deleting GitHubPagesOrigin.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const RUM_TYPE = 'cloudflare:index/webAnalyticsSite:WebAnalyticsSite';

function zoneSlug(zoneName) {
  return String(zoneName).replace(/\./g, '-');
}

/**
 * Previous GitHubPagesOrigin www CNAME URN. CanonicalRedirect www A aliases this
 * Keep in sync with `legacyGithubPagesWwwRecordUrn` in zones.ts.
 */
function legacyGithubPagesWwwRecordUrn(stack, project, zoneName) {
  const slug = zoneSlug(zoneName);
  return (
    `urn:pulumi:${stack}::${project}::edge-dns:zone:ManagedZone$edge-dns:zone:GitHubPagesOrigin` +
    `$cloudflare:index/dnsRecord:DnsRecord::${slug}-github-pages-www`
  );
}

function loadInventory(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const doc = yaml.load(raw);
  if (!doc || typeof doc !== 'object' || !doc.zones || typeof doc.zones !== 'object') {
    throw new Error('zones.yaml: missing top-level `zones` map');
  }
  return doc;
}

function rumUrnsToUnprotect(exportDoc, stack, inventory) {
  const entry = inventory?.zones?.[stack];
  if (!entry || entry.role !== 'vanity') {
    return [];
  }
  const resources = exportDoc?.deployment?.resources;
  if (!Array.isArray(resources)) {
    return [];
  }
  return resources
    .filter((r) => r && r.type === RUM_TYPE && r.protect === true)
    .map((r) => r.urn)
    .filter((urn) => typeof urn === 'string' && urn.length > 0);
}

function main(argv, stdinText, inventoryPath) {
  const stack = argv[2];
  if (!stack) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: 'Usage: pulumi stack export | node scripts/vanity-cutover.cjs <stack>\n',
    };
  }

  let exportDoc;
  try {
    exportDoc = JSON.parse(stdinText || '{}');
  } catch {
    return {
      exitCode: 1,
      stdout: '',
      stderr: 'vanity-cutover: stdin is not JSON (pass `pulumi stack export`)\n',
    };
  }

  let inventory;
  try {
    inventory = loadInventory(inventoryPath);
  } catch (err) {
    return { exitCode: 1, stdout: '', stderr: `${err.message}\n` };
  }

  const urns = rumUrnsToUnprotect(exportDoc, stack, inventory);
  const stdout = urns.length === 0 ? '' : `${urns.join('\n')}\n`;
  return { exitCode: 0, stdout, stderr: '' };
}

module.exports = {
  zoneSlug,
  legacyGithubPagesWwwRecordUrn,
  rumUrnsToUnprotect,
  main,
};

if (require.main === module) {
  const inventoryPath = path.join(__dirname, '..', 'zones.yaml');
  const stdinText = fs.readFileSync(0, 'utf8');
  const result = main(process.argv, stdinText, inventoryPath);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}
