#!/usr/bin/env node
/**
 * Fail if a Pulumi stack tracks a Cloudflare Zone that is not this stack's zone.
 *
 * Importing zone A into stack B, then previewing stack B, tries to delete A.
 * Zones are `protect: true`, so preview fails with "cannot be deleted because
 * it is protected". Fix: `pulumi state delete` the stray URN (do not destroy).
 *
 * Usage:
 *   pulumi stack export --stack <domain> | node scripts/assert-stack-zone-state.cjs <domain>
 */
'use strict';

function expectedZoneNameFromStack(stack) {
  return `${String(stack).replace(/\./g, '-')}-zone`;
}

function resourceNameFromUrn(urn) {
  const parts = String(urn).split('::');
  return parts[parts.length - 1] ?? '';
}

function strayZoneUrns(exportDoc, expectedZoneName) {
  const resources = exportDoc?.deployment?.resources;
  if (!Array.isArray(resources)) {
    return [];
  }
  return resources
    .filter((r) => r && r.type === 'cloudflare:index/zone:Zone')
    .map((r) => r.urn)
    .filter((urn) => typeof urn === 'string' && resourceNameFromUrn(urn) !== expectedZoneName);
}

function main(argv, stdinText) {
  const stack = argv[2];
  if (!stack) {
    return { exitCode: 2, stderr: 'Usage: pulumi stack export | node scripts/assert-stack-zone-state.cjs <stack>\n' };
  }

  let exportDoc;
  try {
    exportDoc = JSON.parse(stdinText || '{}');
  } catch {
    return { exitCode: 1, stderr: 'assert-stack-zone-state: stdin is not JSON (pass `pulumi stack export`)\n' };
  }

  const expected = expectedZoneNameFromStack(stack);
  const stray = strayZoneUrns(exportDoc, expected);
  if (stray.length === 0) {
    return { exitCode: 0, stdout: '', stderr: '' };
  }

  const lines = [
    `Stack "${stack}" tracks Cloudflare zone(s) that are not "${expected}".`,
    'Remove from Pulumi state only — do not destroy; the live zone belongs to its own stack:',
    ...stray.map((urn) => `  pulumi stack select ${stack} && pulumi state delete --yes '${urn}'`),
    '',
  ];
  return { exitCode: 1, stdout: '', stderr: `${lines.join('\n')}\n` };
}

module.exports = {
  expectedZoneNameFromStack,
  resourceNameFromUrn,
  strayZoneUrns,
  main,
};

if (require.main === module) {
  const result = main(process.argv, fsReadStdin());
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}

function fsReadStdin() {
  return require('fs').readFileSync(0, 'utf8');
}
