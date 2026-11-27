#!/usr/bin/env node
/**
 * Read Cloudflare account and zone ids committed in a product hosting.yaml.
 *
 * Reads hosting.yaml in the current directory. No path argument: callers cd
 * to the product work directory first.
 *
 * stdout:
 *   absent
 *   committed\n<accountId>\n<zoneId>
 *
 * Exit 1 when the file sets only one id, or an id is not 32 hex characters.
 * A missing file, or a file with neither id, prints "absent" so legacy stacks
 * can still pass CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_ZONE_ID.
 */
'use strict';

const fs = require('node:fs');

const HEX_ID = /^[a-f0-9]{32}$/;

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseHostingIds(source) {
  /** @type {Record<string, string>} */
  const found = {};
  for (const raw of String(source).split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line.startsWith('- ')) continue;
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = unquote(line.slice(sep + 1).trim());
    if (value === '') continue;
    if (key === 'accountId' || key === 'zoneId' || key === 'zoneName') {
      found[key] = value;
    }
  }

  const hasAccount = Object.prototype.hasOwnProperty.call(found, 'accountId');
  const hasZone = Object.prototype.hasOwnProperty.call(found, 'zoneId');
  if (!hasAccount && !hasZone) return null;
  if (!hasAccount || !hasZone) {
    throw new Error('hosting.yaml must commit both accountId and zoneId');
  }
  if (!HEX_ID.test(found.accountId) || !HEX_ID.test(found.zoneId)) {
    throw new Error('hosting.yaml accountId and zoneId must be 32-character hex ids');
  }
  return {
    accountId: found.accountId,
    zoneId: found.zoneId,
    zoneName: found.zoneName ?? '',
  };
}

/**
 * Committed ids win. Environment ids are used only when hosting.yaml has neither.
 * A copied CLOUDFLARE_ZONE_ID cannot retarget a site that committed its zone.
 *
 * @param {{ hostingSource?: string, envAccountId?: string, envZoneId?: string }} input
 */
function resolveCloudflareIds(input) {
  const committed = parseHostingIds(input.hostingSource ?? '');
  if (committed) {
    return { source: 'hosting.yaml', ...committed };
  }
  const accountId = input.envAccountId ?? '';
  const zoneId = input.envZoneId ?? '';
  if (accountId === '' || zoneId === '') {
    throw new Error(
      'Commit accountId and zoneId in hosting.yaml. Legacy stacks may set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_ZONE_ID until they do.',
    );
  }
  return { source: 'env', accountId, zoneId, zoneName: '' };
}

const HOSTING_FILE = 'hosting.yaml';

function main() {
  let committed;
  try {
    committed = fs.existsSync(HOSTING_FILE)
      ? parseHostingIds(fs.readFileSync(HOSTING_FILE, 'utf8'))
      : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { exitCode: 1, stderr: `${message}\n`, stdout: '' };
  }
  if (!committed) {
    return { exitCode: 0, stderr: '', stdout: 'absent\n' };
  }
  return {
    exitCode: 0,
    stderr: '',
    stdout: `committed\n${committed.accountId}\n${committed.zoneId}\n`,
  };
}

module.exports = {
  parseHostingIds,
  resolveCloudflareIds,
  main,
};

if (require.main === module) {
  const result = main();
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}
