import * as pulumi from '@pulumi/pulumi';
import {
  CanonicalRedirect,
  GitHubPagesOrigin,
  ManagedZone,
  type ZoneBaselineSetting,
} from '@edge-dns/zone';
import {
  assertStackOwnsZone,
  inventoryCanonicalRedirectTo,
  inventoryGithubPagesHost,
} from './zones';

const config = new pulumi.Config();
const accountId = config.require('accountId');
const zoneName = config.require('zoneName');
assertStackOwnsZone(pulumi.getStack(), zoneName);
const zoneType = config.get('zoneType') as
  | 'full'
  | 'partial'
  | 'secondary'
  | 'internal'
  | undefined;

/** Logical resource name: archlens.dev → archlens-dev */
const zoneSlug = zoneName.replace(/\./g, '-');

/**
 * When true, manage baseline ZoneSettings (needs Zone Settings Read/Write on the API token).
 * Default false: product tokens often have DNS/Pages only; zone import still works.
 */
const manageSettings = config.getBoolean('manageSettings') ?? false;

/** Optional override; otherwise vanity `redirectTo` from zones.yaml for this zoneName. */
const canonicalRedirectTo =
  config.get('canonicalRedirectTo') ?? inventoryCanonicalRedirectTo(zoneName);

/** Optional override; otherwise `githubPages` from zones.yaml for this zoneName. */
const githubPagesHost = config.get('githubPagesHost') ?? inventoryGithubPagesHost(zoneName);

if (canonicalRedirectTo && githubPagesHost) {
  throw new Error(
    `Zone ${zoneName} cannot be both a vanity redirect and a GitHub Pages origin`,
  );
}

const baselineSettings: ZoneBaselineSetting[] = manageSettings
  ? [
      { settingId: 'ssl', value: config.get('ssl') ?? 'full' },
      { settingId: 'always_use_https', value: config.get('alwaysUseHttps') ?? 'on' },
      { settingId: 'min_tls_version', value: config.get('minTlsVersion') ?? '1.2' },
      {
        settingId: 'automatic_https_rewrites',
        value: config.get('automaticHttpsRewrites') ?? 'on',
      },
      { settingId: 'tls_1_3', value: config.get('tls13') ?? 'on' },
    ]
  : [];

const managed = new ManagedZone(zoneSlug, {
  accountId,
  zoneName,
  type: zoneType ?? 'full',
  settings: baselineSettings,
});

const redirect = canonicalRedirectTo
  ? new CanonicalRedirect(
      `${zoneSlug}-canonical`,
      {
        zoneId: managed.zoneId,
        zoneName,
        targetHost: canonicalRedirectTo,
      },
      { parent: managed },
    )
  : undefined;

const githubPages = githubPagesHost
  ? new GitHubPagesOrigin(
      `${zoneSlug}-github-pages`,
      {
        accountId,
        zoneId: managed.zoneId,
        zoneName,
        githubIoHost: githubPagesHost,
        challengeToken: config.get('githubPagesChallenge'),
      },
      { parent: managed },
    )
  : undefined;

export const zoneId = managed.zoneId;
export const zoneNameOut = zoneName;
export const nameServers = managed.nameServers;
export const manageSettingsOut = manageSettings;
export const canonicalRedirectToOut = canonicalRedirectTo ?? null;
export const canonicalRedirectRulesetId = redirect ? redirect.ruleset.id : null;
export const githubPagesHostOut = githubPagesHost ?? null;
export const githubPagesWwwCnameId = githubPages ? githubPages.wwwCname.id : null;
export const webAnalyticsSiteTag = githubPages ? githubPages.webAnalytics.siteTag : null;
export const webAnalyticsSiteToken = githubPages ? githubPages.webAnalytics.siteToken : null;
export const webAnalyticsSnippet = githubPages ? githubPages.webAnalytics.snippet : null;
