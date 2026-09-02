import * as cloudflare from '@pulumi/cloudflare';
import * as pulumi from '@pulumi/pulumi';

/** Cloudflare documentation / sinkhole address for proxied redirect-only hosts. */
const REDIRECT_SINKHOLE_IPV4 = '192.0.2.1';

export interface CanonicalRedirectArgs {
  zoneId: pulumi.Input<string>;
  /** Apex of this zone, e.g. `mzworthington.com`. */
  zoneName: pulumi.Input<string>;
  /** Canonical host to send traffic to (no scheme), e.g. `mzworthington.co.uk`. */
  targetHost: pulumi.Input<string>;
  /** Redirect status; default 301. */
  statusCode?: pulumi.Input<301 | 302 | 307 | 308>;
  /**
   * Alias the www stub onto a former GitHub Pages www CNAME so a githubPages →
   * vanity cutover is a replace (delete CNAME, then create A). Creating the A
   * alongside the CNAME fails Cloudflare error 81054.
   */
  wwwRecordAliases?: pulumi.Input<pulumi.URN | pulumi.Alias>[];
}

/**
 * Org vanity zone → canonical host: proxied apex/www DNS stubs plus a
 * Single Redirect (http_request_dynamic_redirect) that preserves path + query.
 *
 * Prerequisite: detach any Pages custom domains on this zone so DNS is free
 * for the stub A records.
 */
export class CanonicalRedirect extends pulumi.ComponentResource {
  public readonly apexRecord: cloudflare.DnsRecord;
  public readonly wwwRecord: cloudflare.DnsRecord;
  public readonly ruleset: cloudflare.Ruleset;

  constructor(name: string, args: CanonicalRedirectArgs, opts?: pulumi.ComponentResourceOptions) {
    super('edge-dns:zone:CanonicalRedirect', name, args, opts);

    const parent = { parent: this };
    const statusCode = args.statusCode ?? 301;

    this.apexRecord = new cloudflare.DnsRecord(
      `${name}-apex`,
      {
        zoneId: args.zoneId,
        name: args.zoneName,
        type: 'A',
        content: REDIRECT_SINKHOLE_IPV4,
        proxied: true,
        ttl: 1,
        comment: 'Org vanity redirect stub (edge-dns)',
      },
      parent,
    );

    this.wwwRecord = new cloudflare.DnsRecord(
      `${name}-www`,
      {
        zoneId: args.zoneId,
        name: pulumi.interpolate`www.${args.zoneName}`,
        type: 'A',
        content: REDIRECT_SINKHOLE_IPV4,
        proxied: true,
        ttl: 1,
        comment: 'Org vanity redirect stub (edge-dns)',
      },
      {
        ...parent,
        deleteBeforeReplace: true,
        aliases: args.wwwRecordAliases,
      },
    );

    this.ruleset = new cloudflare.Ruleset(
      `${name}-redirects`,
      {
        zoneId: args.zoneId,
        name: 'org-canonical-redirects',
        description: pulumi.interpolate`301 all traffic to https://${args.targetHost}`,
        kind: 'zone',
        phase: 'http_request_dynamic_redirect',
        rules: [
          {
            ref: 'canonical-host',
            description: pulumi.interpolate`Redirect ${args.zoneName} → ${args.targetHost}`,
            expression: 'true',
            action: 'redirect',
            enabled: true,
            actionParameters: {
              fromValue: {
                statusCode,
                preserveQueryString: true,
                targetUrl: {
                  expression: pulumi.interpolate`concat("https://${args.targetHost}", http.request.uri.path)`,
                },
              },
            },
          },
        ],
      },
      parent,
    );

    this.registerOutputs({
      apexRecordId: this.apexRecord.id,
      wwwRecordId: this.wwwRecord.id,
      rulesetId: this.ruleset.id,
      targetHost: args.targetHost,
    });
  }
}
