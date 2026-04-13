// Export all lib utilities
export { colors } from './colors';
export { theme, spacing, borderRadius, shadows, fonts } from './theme';
export type { Typography } from './theme';
export { wp, hp, fp, rem, br, remSmall, screenDimensions } from './responsive';

import { theme, type Typography } from './theme';

/** Fresh fp() on each property access — avoid frozen typography from first module import. */
export const typography = new Proxy({} as Typography, {
  get(_, prop: string | symbol) {
    if (typeof prop === 'string') {
      return (theme.typography as Record<string, unknown>)[prop];
    }
    return undefined;
  },
});

// Re-export types
export type { ColorKey, PrimaryColorKey, SecondaryColorKey, NeutralColorKey, SemanticColorKey } from './colors';
