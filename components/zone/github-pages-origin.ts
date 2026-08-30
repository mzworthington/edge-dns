import * as cloudflare from '@pulumi/cloudflare';
import * as pulumi from '@pulumi/pulumi';

/**
 * GitHub Pages apex addresses (unproxied).
 * https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
 */
export const GITHUB_PAGES_IPV4 = [
  '185.199.108.153',
  '185.199.109.153',
  '185.199.110.153',
  '185.199.111.153',
] as const;

export const GITHUB_PAGES_IPV6 = [
  '2606:50c0:8000::153',
  '2606:50c0:8001::153',
  '2606:50c0:8002::153',
  '2606:50c0:8003::153',
] as const;

export interface GitHubPagesOriginArgs {
  zoneId: pulumi.Input<string>;
  /** Apex of this zone, e.g. `eval-driven-development.dev`. */
  zoneName: pulumi.Input<string>;
  /** GitHub Pages default host, e.g. `mzworthington.github.io`. */
  githubIoHost: pulumi.Input<string>;
  /**
   * Optional domain-verification token from GitHub Pages settings
   * (`_github-pages-challenge-<owner>` TXT).
   */
  challengeToken?: pulumi.Input<string>;
}

/**
 * Point an apex zone at GitHub Pages: four A + four AAAA at the apex,
 * www CNAME to the github.io host. Records are DNS-only (not proxied) so
 * GitHub can verify the domain and issue the Pages certificate.
 */
export class GitHubPagesOrigin extends pulumi.ComponentResource {
  public readonly apexA: cloudflare.DnsRecord[];
  public readonly apexAaaa: cloudflare.DnsRecord[];
  public readonly wwwCname: cloudflare.DnsRecord;
  public readonly challengeTxt?: cloudflare.DnsRecord;

  constructor(name: string, args: GitHubPagesOriginArgs, opts?: pulumi.ComponentResourceOptions) {
    super('edge-dns:zone:GitHubPagesOrigin', name, args, opts);

    const parent = { parent: this };
    const dnsOpts = { ...parent, deleteBeforeReplace: true };

    this.apexA = GITHUB_PAGES_IPV4.map(
      (ip, i) =>
        new cloudflare.DnsRecord(
          `${name}-apex-a-${i}`,
          {
            zoneId: args.zoneId,
            name: args.zoneName,
            type: 'A',
            content: ip,
            proxied: false,
            ttl: 3600,
            comment: 'GitHub Pages apex (edge-dns)',
          },
          dnsOpts,
        ),
    );

    this.apexAaaa = GITHUB_PAGES_IPV6.map(
      (ip, i) =>
        new cloudflare.DnsRecord(
          `${name}-apex-aaaa-${i}`,
          {
            zoneId: args.zoneId,
            name: args.zoneName,
            type: 'AAAA',
            content: ip,
            proxied: false,
            ttl: 3600,
            comment: 'GitHub Pages apex IPv6 (edge-dns)',
          },
          dnsOpts,
        ),
    );

    this.wwwCname = new cloudflare.DnsRecord(
      `${name}-www`,
      {
        zoneId: args.zoneId,
        name: pulumi.interpolate`www.${args.zoneName}`,
        type: 'CNAME',
        content: args.githubIoHost,
        proxied: false,
        ttl: 3600,
        comment: 'GitHub Pages www (edge-dns)',
      },
      dnsOpts,
    );

    if (args.challengeToken) {
      const owner = pulumi.output(args.githubIoHost).apply((host) => host.replace(/\.github\.io$/i, ''));
      this.challengeTxt = new cloudflare.DnsRecord(
        `${name}-challenge`,
        {
          zoneId: args.zoneId,
          name: pulumi.interpolate`_github-pages-challenge-${owner}`,
          type: 'TXT',
          content: args.challengeToken,
          proxied: false,
          ttl: 3600,
          comment: 'GitHub Pages domain verification (edge-dns)',
        },
        dnsOpts,
      );
    }

    this.registerOutputs({
      githubIoHost: args.githubIoHost,
      wwwCnameId: this.wwwCname.id,
    });
  }
}
