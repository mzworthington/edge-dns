import * as pulumi from '@pulumi/pulumi';
import { ManagedZone, type ZoneBaselineSetting } from '@edge-dns/zone';

const config = new pulumi.Config();
const accountId = config.require('accountId');
const zoneName = config.require('zoneName');
const zoneType = config.get('zoneType') as
  | 'full'
  | 'partial'
  | 'secondary'
  | 'internal'
  | undefined;

/**
 * When true, manage baseline ZoneSettings (needs Zone Settings Read/Write on the API token).
 * Default false: product tokens often have DNS/Pages only; zone import still works.
 */
const manageSettings = config.getBoolean('manageSettings') ?? false;

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

const managed = new ManagedZone('archlens', {
  accountId,
  zoneName,
  type: zoneType ?? 'full',
  settings: baselineSettings,
});

export const zoneId = managed.zoneId;
export const zoneNameOut = zoneName;
export const nameServers = managed.nameServers;
export const manageSettingsOut = manageSettings;
