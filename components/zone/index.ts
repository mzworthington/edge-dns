import * as cloudflare from '@pulumi/cloudflare';
import * as pulumi from '@pulumi/pulumi';

export interface ZoneBaselineSetting {
  /** Cloudflare setting id (snake_case), e.g. `always_use_https`. */
  settingId: string;
  value: pulumi.Input<string | number | boolean | object>;
}

export interface ManagedZoneArgs {
  accountId: pulumi.Input<string>;
  /** Apex domain name, e.g. `archlens.dev`. */
  zoneName: pulumi.Input<string>;
  /** `full` (default), `partial`, `secondary`, or `internal`. */
  type?: pulumi.Input<'full' | 'partial' | 'secondary' | 'internal'>;
  /**
   * Zone settings to manage. Requires a token with Zone Settings Read/Write.
   * Omit (or pass []) when the token is DNS/Pages-scoped only.
   */
  settings?: ZoneBaselineSetting[];
}

/**
 * Cloudflare zone plus optional baseline settings.
 * Product DNS / Pages stay in product repos — do not add DnsRecord here.
 */
export class ManagedZone extends pulumi.ComponentResource {
  public readonly zone: cloudflare.Zone;
  public readonly zoneId: pulumi.Output<string>;
  public readonly nameServers: pulumi.Output<string[]>;
  public readonly settings: cloudflare.ZoneSetting[];

  constructor(name: string, args: ManagedZoneArgs, opts?: pulumi.ComponentResourceOptions) {
    super('edge-dns:zone:ManagedZone', name, args, opts);

    const parent = { parent: this };

    this.zone = new cloudflare.Zone(
      `${name}-zone`,
      {
        account: { id: args.accountId },
        name: args.zoneName,
        type: args.type ?? 'full',
      },
      {
        ...parent,
        protect: true,
        retainOnDelete: true,
        // Allow adopting a zone imported at stack root before the component existed.
        aliases: [{ parent: pulumi.rootStackResource }],
      },
    );

    this.zoneId = this.zone.id;
    this.nameServers = this.zone.nameServers;

    this.settings = (args.settings ?? []).map(
      (setting) =>
        new cloudflare.ZoneSetting(
          `${name}-${setting.settingId.replace(/_/g, '-')}`,
          {
            zoneId: this.zone.id,
            settingId: setting.settingId,
            value: setting.value,
          },
          parent,
        ),
    );

    this.registerOutputs({
      zoneId: this.zoneId,
      nameServers: this.nameServers,
      zoneName: this.zone.name,
    });
  }
}
