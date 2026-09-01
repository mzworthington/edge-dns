import * as path from 'node:path';
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
  accountId: pulumi.Input<string>;
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
 * www CNAME to the github.io host, plus the zone Web Analytics / RUM site
 * and a first-party RUM proxy on `insights.<zone>`.
 * Records are DNS-only (not proxied) so GitHub can verify the domain and
 * issue the Pages certificate. Auto-inject therefore does not run; the
 * product HTML must embed `webAnalyticsSnippet` (beacon loaded from the proxy).
 */
export class GitHubPagesOrigin extends pulumi.ComponentResource {
  public readonly apexA: cloudflare.DnsRecord[];
  public readonly apexAaaa: cloudflare.DnsRecord[];
  public readonly wwwCname: cloudflare.DnsRecord;
  public readonly challengeTxt?: cloudflare.DnsRecord;
  /**
   * Zone-tagged Web Analytics / RUM site. Auto-inject is a no-op on
   * DNS-only GitHub Pages records; the product HTML must embed `snippet`.
   */
  public readonly webAnalytics: cloudflare.WebAnalyticsSite;
  public readonly rumProxyScript: cloudflare.WorkersScript;
  public readonly rumProxyDomain: cloudflare.WorkersCustomDomain;
  /** `insights.<zone>` — first-party beacon + RUM proxy. */
  public readonly rumProxyHostname: pulumi.Output<string>;
  /** Snippet that loads the beacon from the first-party proxy. */
  public readonly webAnalyticsSnippet: pulumi.Output<string>;

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

    this.webAnalytics = new cloudflare.WebAnalyticsSite(
      `${name}-web-analytics`,
      {
        accountId: args.accountId,
        zoneTag: args.zoneId,
        autoInstall: true,
      },
      {
        ...parent,
        protect: true,
      },
    );

    this.rumProxyHostname = pulumi.interpolate`insights.${args.zoneName}`;
    const allowedOrigins = pulumi.interpolate`https://${args.zoneName},https://www.${args.zoneName}`;
    const rumScriptName = pulumi.output(args.zoneName).apply((zone) =>
      `${zone.replace(/\./g, '-')}-rum-proxy`,
    );

    this.rumProxyScript = new cloudflare.WorkersScript(
      `${name}-rum-proxy`,
      {
        accountId: args.accountId,
        scriptName: rumScriptName,
        content: rumProxyWorkerSource,
        contentFile: path.join(__dirname, 'rum-proxy-worker.mjs'),
        mainModule: 'rum-proxy-worker.mjs',
        contentType: 'application/javascript+module',
        compatibilityDate: '2024-11-06',
        bindings: [
          {
            name: 'ALLOWED_ORIGINS',
            type: 'plain_text',
            text: allowedOrigins,
          },
        ],
      },
      parent,
    );

    this.rumProxyDomain = new cloudflare.WorkersCustomDomain(
      `${name}-rum-proxy-domain`,
      {
        accountId: args.accountId,
        zoneId: args.zoneId,
        zoneName: args.zoneName,
        hostname: this.rumProxyHostname,
        service: this.rumProxyScript.scriptName,
      },
      { ...parent, dependsOn: [this.rumProxyScript] },
    );

    this.webAnalyticsSnippet = pulumi
      .all([this.rumProxyHostname, this.webAnalytics.siteToken])
      .apply(([hostname, token]) => {
        const origin = `https://${hostname}`;
        const payload = JSON.stringify({
          token,
          send: { to: `${origin}/rum` },
        });
        return `<script type="module" src="${origin}/beacon.min.js" data-cf-beacon='${payload}'></script>`;
      });

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
      webAnalyticsSiteTag: this.webAnalytics.siteTag,
      webAnalyticsSiteToken: this.webAnalytics.siteToken,
      webAnalyticsSnippet: this.webAnalyticsSnippet,
      rumProxyHostname: this.rumProxyHostname,
    });
  }
}
