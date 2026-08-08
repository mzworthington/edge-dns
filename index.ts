import * as pulumi from '@pulumi/pulumi';
import { CanonicalRedirect, ManagedZone, type ZoneBaselineSetting } from '@edge-dns/zone';
import { ORG_CANONICAL_REDIRECTS } from './org-redirects';

const config = new pulumi.Config();
const accountId = config.require('accountId');
const zoneName = config.require('zoneName');
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

/** Optional override; otherwise {@link ORG_CANONICAL_REDIRECTS} for this zoneName. */
const canonicalRedirectTo =
  config.get('canonicalRedirectTo') ?? ORG_CANONICAL_REDIRECTS[zoneName];

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

export const zoneId = managed.zoneId;
export const zoneNameOut = zoneName;
export const nameServers = managed.nameServers;
export const manageSettingsOut = manageSettings;
export const canonicalRedirectToOut = canonicalRedirectTo ?? null;
export const canonicalRedirectRulesetId = redirect ? redirect.ruleset.id : null;
