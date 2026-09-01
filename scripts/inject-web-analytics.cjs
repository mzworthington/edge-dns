#!/usr/bin/env node
/**
 * Inject the Cloudflare Web Analytics (RUM) beacon into built HTML.
 *
 * Pages and Workers skip zone auto-inject, so product deploys run this against
 * dist (or Worker static assets) using the zone's existing WebAnalyticsSite.
 *
 * Usage:
 *   CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_ZONE_ID=… CLOUDFLARE_API_TOKEN=… \
 *     node scripts/inject-web-analytics.cjs [--spa] [--optional] [--token TOKEN] [--beacon-origin URL] -- <file-or-dir>
 *
 * CLOUDFLARE_WEB_ANALYTICS_TOKEN skips the API lookup (tests / local).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const BEACON_HOST = 'static.cloudflareinsights.com/beacon.min.js';
const RUM_LIST_URL = (accountId) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/rum/site_info/list?per_page=1000`;

function beaconSnippet(token, spa, beaconOrigin) {
  const payload = spa ? { token, spa: true } : { token };
  if (beaconOrigin) {
    const origin = String(beaconOrigin).replace(/\/$/, '');
    payload.send = { to: `${origin}/cdn-cgi/rum` };
    return `<script type="module" src="${origin}/beacon.min.js" data-cf-beacon='${JSON.stringify(payload)}'></script>`;
  }
  return `<script type="module" src="https://${BEACON_HOST}" data-cf-beacon='${JSON.stringify(payload)}'></script>`;
}

function injectHtml(html, token, spa, beaconOrigin) {
  if (html.includes('beacon.min.js')) {
    return { html, changed: false };
  }
  const bodyClose = html.lastIndexOf('</body>');
  if (bodyClose === -1) {
    throw new Error('HTML has no </body>; cannot inject Web Analytics beacon');
  }
  const snippet = beaconSnippet(token, spa, beaconOrigin);
  return {
    html: `${html.slice(0, bodyClose)}  ${snippet}\n${html.slice(bodyClose)}`,
    changed: true,
  };
}

function htmlFilesUnder(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    return [target];
  }
  if (!stat.isDirectory()) {
    throw new Error(`${target} is not a file or directory`);
  }
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
        found.push(full);
      }
    }
  };
  walk(target);
  return found.sort();
}

function siteTokenForZone(sites, zoneId) {
  if (!Array.isArray(sites)) {
    return null;
  }
  const match = sites.find((site) => (site?.zone_tag || site?.zoneTag) === zoneId);
  if (!match) {
    return null;
  }
  return match.site_token || match.siteToken || null;
}

function parseArgs(argv) {
  const parsed = {
    spa: false,
    optional: false,
    token: undefined,
    beaconOrigin: undefined,
    htmlPath: undefined,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') {
      parsed.htmlPath = args[i + 1];
      break;
    }
    if (arg === '--spa') {
      parsed.spa = true;
      continue;
    }
    if (arg === '--optional') {
      parsed.optional = true;
      continue;
    }
    if (arg === '--token') {
      parsed.token = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--beacon-origin') {
      parsed.beaconOrigin = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown flag ${arg}`);
    }
    parsed.htmlPath = arg;
  }
  return parsed;
}

async function fetchRumSites(env, fetchImpl) {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (or CLOUDFLARE_WEB_ANALYTICS_TOKEN)');
  }
  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('fetch is not available');
  }
  const response = await fetchFn(RUM_LIST_URL(accountId), {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!response.ok) {
    throw new Error(`RUM site list failed: HTTP ${response.status}`);
  }
  const body = await response.json();
  if (body?.success === false) {
    const first = Array.isArray(body.errors) ? body.errors[0]?.message : undefined;
    throw new Error(first || 'RUM site list returned success=false');
  }
  return Array.isArray(body?.result) ? body.result : [];
}

async function resolveToken(opts, env, io) {
  if (opts.token) {
    return opts.token;
  }
  if (env.CLOUDFLARE_WEB_ANALYTICS_TOKEN) {
    return env.CLOUDFLARE_WEB_ANALYTICS_TOKEN;
  }
  const zoneId = env.CLOUDFLARE_ZONE_ID;
  if (!zoneId) {
    throw new Error('Set CLOUDFLARE_ZONE_ID (or pass --token / CLOUDFLARE_WEB_ANALYTICS_TOKEN)');
  }
  const fetchSites = io.fetchSites ?? (() => fetchRumSites(env, io.fetch));
  const sites = await fetchSites();
  return siteTokenForZone(sites, zoneId);
}

async function main(argv, env, io = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    return { exitCode: 2, stdout: '', stderr: `${err.message}\n` };
  }
  if (!opts.htmlPath) {
    return {
      exitCode: 2,
      stdout: '',
      stderr:
        'Usage: node scripts/inject-web-analytics.cjs [--spa] [--optional] [--token TOKEN] [--beacon-origin URL] -- <file-or-dir>\n',
    };
  }

  let token;
  try {
    token = await resolveToken(opts, env, io);
  } catch (err) {
    return { exitCode: 1, stdout: '', stderr: `${err.message}\n` };
  }

  if (!token) {
    const message =
      `No Web Analytics site for zone ${env.CLOUDFLARE_ZONE_ID || '(unset)'}. ` +
      'Apply the product (or zone-owner) WebAnalyticsSite, then redeploy.';
    if (opts.optional) {
      return { exitCode: 0, stdout: '', stderr: `${message} skipping.\n` };
    }
    return { exitCode: 1, stdout: '', stderr: `${message}\n` };
  }

  let files;
  try {
    files = htmlFilesUnder(opts.htmlPath);
  } catch (err) {
    return { exitCode: 1, stdout: '', stderr: `${err.message}\n` };
  }

  if (files.length === 0) {
    return { exitCode: 1, stdout: '', stderr: `No HTML files under ${opts.htmlPath}\n` };
  }

  let changed = 0;
  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    let next;
    try {
      next = injectHtml(original, token, opts.spa, opts.beaconOrigin);
    } catch (err) {
      return { exitCode: 1, stdout: '', stderr: `${file}: ${err.message}\n` };
    }
    if (next.changed) {
      fs.writeFileSync(file, next.html);
      changed += 1;
    }
  }

  return {
    exitCode: 0,
    stdout: `Injected Web Analytics beacon into ${changed}/${files.length} HTML file(s)\n`,
    stderr: '',
  };
}

module.exports = {
  BEACON_HOST,
  beaconSnippet,
  injectHtml,
  htmlFilesUnder,
  siteTokenForZone,
  parseArgs,
  fetchRumSites,
  main,
};

if (require.main === module) {
  main(process.argv, process.env)
    .then((result) => {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      process.exit(result.exitCode);
    })
    .catch((err) => {
      process.stderr.write(`${err.stack || err.message}\n`);
      process.exit(1);
    });
}
