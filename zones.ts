import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/** Zone lifecycle role in this repo. */
export type ZoneRole = 'product' | 'vanity';

export interface ZoneEntry {
  role: ZoneRole;
  /** Canonical host (no scheme) when role is vanity. */
  redirectTo?: string;
  /**
   * GitHub Pages default host (e.g. `mzworthington.github.io`).
   * When set on a product zone, this repo owns apex/www DNS to that origin.
   */
  githubPages?: string;
  manageSettings?: boolean;
  notes?: string;
}

export interface ZonesInventory {
  accountId: string;
  zones: Record<string, ZoneEntry>;
}

/** Inventory lives at the Pulumi project root (cwd when the program runs). */
const INVENTORY_PATH = path.join(process.cwd(), 'zones.yaml');

const GITHUB_IO_HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.github\.io$/i;

function assertInventory(doc: unknown): ZonesInventory {
  if (!doc || typeof doc !== 'object' || !('zones' in doc)) {
    throw new Error('zones.yaml: missing top-level `zones` map');
  }
  const record = doc as { accountId?: unknown; zones?: unknown };
  const accountId = record.accountId;
  if (typeof accountId !== 'string' || accountId.trim() === '') {
    throw new Error('zones.yaml: missing top-level `accountId`');
  }
  const zones = record.zones as ZonesInventory['zones'];
  if (!zones || typeof zones !== 'object' || Array.isArray(zones)) {
    throw new Error('zones.yaml: `zones` must be a map of domain → entry');
  }

  for (const [name, entry] of Object.entries(zones)) {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`zones.yaml: invalid entry for ${name}`);
    }
    if (entry.role !== 'product' && entry.role !== 'vanity') {
      throw new Error(`zones.yaml: ${name} role must be "product" or "vanity"`);
    }
    if (entry.role === 'vanity') {
      if (!entry.redirectTo || typeof entry.redirectTo !== 'string') {
        throw new Error(`zones.yaml: vanity zone ${name} requires redirectTo`);
      }
      if (entry.githubPages) {
        throw new Error(`zones.yaml: vanity zone ${name} cannot set githubPages`);
      }
    }
    if (entry.githubPages !== undefined) {
      if (typeof entry.githubPages !== 'string' || !GITHUB_IO_HOST.test(entry.githubPages)) {
        throw new Error(
          `zones.yaml: ${name} githubPages must be a github.io host, e.g. mzworthington.github.io`,
        );
      }
    }
  }

  return { accountId, zones };
}

/** Load and validate the zone inventory. */
export function loadZonesInventory(
  filePath: string = INVENTORY_PATH,
): ZonesInventory {
  const raw = fs.readFileSync(filePath, 'utf8');
  return assertInventory(yaml.load(raw));
}

/** Stack / domain names in stable order. */
export function listZoneStacks(filePath?: string): string[] {
  return Object.keys(loadZonesInventory(filePath).zones).sort((a, b) => a.localeCompare(b));
}

export function inventoryManageSettings(zoneName: string, filePath?: string): boolean {
  const entry = loadZonesInventory(filePath).zones[zoneName];
  if (!entry) {
    throw new Error(`zones.yaml: unknown zone ${zoneName}`);
  }
  return entry.manageSettings === true;
}

export interface EdgeStackSettings {
  accountId: string;
  zoneName: string;
  manageSettings: boolean;
}

export function edgeStackSettings(stack: string, filePath?: string): EdgeStackSettings {
  const inventory = loadZonesInventory(filePath);
  return {
    accountId: inventory.accountId,
    zoneName: stack,
    manageSettings: inventoryManageSettings(stack, filePath),
  };
}

export function inventoryCanonicalRedirectTo(
  zoneName: string,
  filePath?: string,
): string | undefined {
  const entry = loadZonesInventory(filePath).zones[zoneName];
  if (!entry || entry.role !== 'vanity') {
    return undefined;
  }
  return entry.redirectTo;
}

/**
 * GitHub Pages origin host for a zone from inventory.
 * Undefined when the zone does not publish via GitHub Pages.
 */
export function inventoryGithubPagesHost(
  zoneName: string,
  filePath?: string,
): string | undefined {
  const entry = loadZonesInventory(filePath).zones[zoneName];
  if (!entry || entry.role !== 'product') {
    return undefined;
  }
  return entry.githubPages;
}

/** Logical resource slug: eval-driven-development.dev → eval-driven-development-dev */
export function zoneSlug(zoneName: string): string {
  return zoneName.replace(/\./g, '-');
}

/**
 * URN of the GitHubPagesOrigin www CNAME. Vanity www A records alias this so a
 * githubPages → vanity cutover is a replace (Cloudflare error 81054 otherwise).
 * Keep in sync with `scripts/vanity-cutover.cjs`.
 */
export function legacyGithubPagesWwwRecordUrn(
  stack: string,
  project: string,
  zoneName: string,
): string {
  const slug = zoneSlug(zoneName);
  return (
    `urn:pulumi:${stack}::${project}::edge-dns:zone:ManagedZone$edge-dns:zone:GitHubPagesOrigin` +
    `$cloudflare:index/dnsRecord:DnsRecord::${slug}-github-pages-www`
  );
}
