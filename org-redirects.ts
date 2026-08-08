/**
 * Zones that only forward to a canonical host (org vanity domains).
 * Stack `zoneName` → redirect target host (no scheme).
 *
 * Detach Pages custom domains on these zones before first apply.
 */
export const ORG_CANONICAL_REDIRECTS: Readonly<Record<string, string>> = {
  'matthewworthington.com': 'mzworthington.co.uk',
  'mzworthington.com': 'mzworthington.co.uk',
};
