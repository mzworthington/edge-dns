#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  parseHostingIds,
  resolveCloudflareIds,
  main: readMain,
} = require('../.github/actions/setup-pulumi-cloudflare/read-hosting-ids.cjs');
const { upsertHostingIds } = require('./upsert-hosting-ids.cjs');

const YUSUR_ACCOUNT = 'fe0bb0a89551958509fe4d65883026cc';
const YUSUR_ZONE = '8fa428280586fdd39a02330d36ae0727';
const ARCHLENS_ZONE = 'a60606cf6d3627b9100e2b430dbe0870';

const YUSUR_HOSTING = `accountId: ${YUSUR_ACCOUNT}
zoneId: ${YUSUR_ZONE}
zoneName: yusur.co.uk
pagesProjectName: yusur
pagesHostnames:
  - www.yusur.co.uk
  - yusur.co.uk
enableWebAnalytics: false
`;

describe('committed Cloudflare ids', () => {
  it('reads account id, zone id, and zone name from hosting.yaml', () => {
    assert.deepEqual(parseHostingIds(YUSUR_HOSTING), {
      accountId: YUSUR_ACCOUNT,
      zoneId: YUSUR_ZONE,
      zoneName: 'yusur.co.uk',
    });
  });

  it('accepts quoted ids', () => {
    const parsed = parseHostingIds(
      `accountId: "${YUSUR_ACCOUNT}"\nzoneId: '${YUSUR_ZONE}'\n`,
    );
    assert.equal(parsed.accountId, YUSUR_ACCOUNT);
    assert.equal(parsed.zoneId, YUSUR_ZONE);
  });

  it('treats a hosting file without ids as absent', () => {
    assert.equal(
      parseHostingIds('pagesProjectName: yusur\npagesHostnames:\n  - yusur.co.uk\n'),
      null,
    );
  });

  it('rejects a file that commits only one id', () => {
    assert.throws(
      () => parseHostingIds(`accountId: ${YUSUR_ACCOUNT}\n`),
      /both accountId and zoneId/,
    );
  });

  it('rejects ids that are not 32 hex characters', () => {
    assert.throws(
      () => parseHostingIds('accountId: not-a-zone\nzoneId: also-not\n'),
      /32-character hex/,
    );
  });

  it('ignores a copied zone id secret when hosting.yaml commits the site zone', () => {
    const resolved = resolveCloudflareIds({
      hostingSource: YUSUR_HOSTING,
      envAccountId: YUSUR_ACCOUNT,
      envZoneId: ARCHLENS_ZONE,
    });
    assert.equal(resolved.source, 'hosting.yaml');
    assert.equal(resolved.zoneId, YUSUR_ZONE);
    assert.equal(resolved.accountId, YUSUR_ACCOUNT);
    assert.notEqual(resolved.zoneId, ARCHLENS_ZONE);
  });

  it('uses env ids only when hosting.yaml does not commit them', () => {
    const resolved = resolveCloudflareIds({
      hostingSource: 'pagesProjectName: archlens\n',
      envAccountId: YUSUR_ACCOUNT,
      envZoneId: ARCHLENS_ZONE,
    });
    assert.equal(resolved.source, 'env');
    assert.equal(resolved.zoneId, ARCHLENS_ZONE);
  });

  it('fails when neither the file nor the environment has both ids', () => {
    assert.throws(
      () => resolveCloudflareIds({ hostingSource: '', envAccountId: '', envZoneId: '' }),
      /Commit accountId and zoneId/,
    );
  });

  it('prints committed ids for the action, and absent when the file has none', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-ids-'));
    const previous = process.cwd();
    process.chdir(dir);
    try {
      fs.writeFileSync('hosting.yaml', YUSUR_HOSTING);
      const committed = readMain();
      assert.equal(committed.exitCode, 0);
      assert.equal(committed.stdout, `committed\n${YUSUR_ACCOUNT}\n${YUSUR_ZONE}\n`);

      fs.writeFileSync('hosting.yaml', 'pagesProjectName: legacy\n');
      const absent = readMain();
      assert.equal(absent.stdout, 'absent\n');

      fs.rmSync('hosting.yaml');
      const missing = readMain();
      assert.equal(missing.stdout, 'absent\n');
    } finally {
      process.chdir(previous);
    }
  });
});

describe('upsert hosting ids', () => {
  it('inserts account, zone, and zone name without dropping hostnames', () => {
    const next = upsertHostingIds(
      'pagesProjectName: yusur\npagesHostnames:\n  - yusur.co.uk\n',
      { accountId: YUSUR_ACCOUNT, zoneId: YUSUR_ZONE, zoneName: 'yusur.co.uk' },
    );
    assert.match(next, new RegExp(`^accountId: ${YUSUR_ACCOUNT}\nzoneId: ${YUSUR_ZONE}\nzoneName: yusur\\.co\\.uk\n`));
    assert.match(next, /pagesHostnames:\n  - yusur\.co\.uk\n/);
  });

  it('replaces existing ids in place', () => {
    const next = upsertHostingIds(
      `accountId: ${ARCHLENS_ZONE}\nzoneId: ${ARCHLENS_ZONE}\nzoneName: archlens.dev\npagesProjectName: yusur\n`,
      { accountId: YUSUR_ACCOUNT, zoneId: YUSUR_ZONE, zoneName: 'yusur.co.uk' },
    );
    assert.equal(next.match(/accountId:/g).length, 1);
    assert.match(next, new RegExp(`accountId: ${YUSUR_ACCOUNT}`));
    assert.match(next, new RegExp(`zoneId: ${YUSUR_ZONE}`));
    assert.match(next, /zoneName: yusur\.co\.uk/);
    assert.doesNotMatch(next, /archlens/);
  });
});

describe('product Pulumi workflow uses committed ids', () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '.github/workflows/product-pulumi-cloudflare.yml'),
    'utf8',
  );
  const action = fs.readFileSync(
    path.join(__dirname, '..', '.github/actions/setup-pulumi-cloudflare/action.yml'),
    'utf8',
  );
  const bootstrap = fs.readFileSync(
    path.join(__dirname, 'setup-cloudflare-hosting.sh'),
    'utf8',
  );

  it('does not require account or zone id secrets when hosting.yaml commits them', () => {
    assert.match(workflow, /read-hosting-ids\.cjs/);
    assert.match(workflow, /ids-committed/);
    assert.match(workflow, /PULUMI_ACCESS_TOKEN CLOUDFLARE_API_TOKEN/);
    assert.match(
      workflow,
      /ids-committed != 'true' && secrets\.CLOUDFLARE_ZONE_ID/,
    );
    assert.match(
      workflow,
      /ids-committed != 'true' && secrets\.CLOUDFLARE_ACCOUNT_ID/,
    );
  });

  it('action reads hosting.yaml and drops env ids on that path', () => {
    assert.match(action, /read-hosting-ids\.cjs/);
    assert.match(action, /unset CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_ZONE_ID/);
    assert.match(action, /pulumi config set accountId "\$account_id"/);
    assert.match(action, /pulumi config set zoneId "\$zone_id"/);
    assert.match(action, /cloudflare:apiToken/);
    assert.doesNotMatch(action, /CLOUDFLARE_ACCOUNT_ID:\?Set CLOUDFLARE_ACCOUNT_ID"\n/);
  });

  it('bootstrap writes hosting.yaml ids and still stores only tokens as secrets', () => {
    assert.match(bootstrap, /upsert-hosting-ids\.cjs/);
    assert.match(bootstrap, /gh secret set CLOUDFLARE_API_TOKEN/);
    assert.match(bootstrap, /gh secret set PULUMI_ACCESS_TOKEN/);
    assert.match(bootstrap, /if \[\[ -f "\$HOSTING_FILE" \]\]/);
  });
});
