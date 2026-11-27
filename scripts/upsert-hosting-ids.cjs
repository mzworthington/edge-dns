#!/usr/bin/env node
/**
 * Write Cloudflare account id, zone id, and zone name into a product hosting.yaml.
 * Replaces those keys in place. Inserts any that are missing at the top.
 * Does not create the file — callers skip this when the product has no hosting.yaml.
 *
 * Reads and writes hosting.yaml in the current directory.
 *
 * Usage: node upsert-hosting-ids.cjs <accountId> <zoneId> <zoneName>
 */
'use strict';

const fs = require('node:fs');

const HEX_ID = /^[a-f0-9]{32}$/;
const KEYS = ['accountId', 'zoneId', 'zoneName'];

function upsertHostingIds(source, values) {
  for (const key of ['accountId', 'zoneId']) {
    if (!HEX_ID.test(values[key] ?? '')) {
      throw new Error(`${key} must be a 32-character hex id`);
    }
  }
  if (typeof values.zoneName !== 'string' || values.zoneName.trim() === '') {
    throw new Error('zoneName is required');
  }

  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  const replaced = new Set();
  const next = lines.map((line) => {
    const match = /^(accountId|zoneId|zoneName):[ \t]?(.*)$/.exec(line);
    if (!match) return line;
    const key = match[1];
    replaced.add(key);
    return `${key}: ${values[key]}`;
  });

  const missing = KEYS.filter((key) => !replaced.has(key));
  const prefix = missing.map((key) => `${key}: ${values[key]}`);
  const hadTrailingNewline = source.endsWith('\n');
  let body = next.join(newline);
  if (hadTrailingNewline) {
    if (!body.endsWith(newline)) body += newline;
  } else if (body.endsWith(newline)) {
    body = body.slice(0, -newline.length);
  }
  if (prefix.length === 0) return body;
  const head = prefix.join(newline);
  if (body === '') return hadTrailingNewline ? `${head}${newline}` : head;
  return `${head}${newline}${body}`;
}

const HOSTING_FILE = 'hosting.yaml';

function main(argv) {
  const accountId = argv[2];
  const zoneId = argv[3];
  const zoneName = argv[4];
  if (!accountId || !zoneId || !zoneName) {
    return {
      exitCode: 2,
      stderr: 'Usage: upsert-hosting-ids.cjs <accountId> <zoneId> <zoneName>\n',
    };
  }
  let next;
  try {
    next = upsertHostingIds(fs.readFileSync(HOSTING_FILE, 'utf8'), {
      accountId,
      zoneId,
      zoneName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { exitCode: 1, stderr: `${message}\n` };
  }
  fs.writeFileSync(HOSTING_FILE, next);
  return { exitCode: 0, stderr: '' };
}

module.exports = { upsertHostingIds, main };

if (require.main === module) {
  const result = main(process.argv);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}
