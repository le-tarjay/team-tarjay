// The nav destinations/routes gated by the tier × department × function
// permission model (ADR-frontend §4.2). Mirrors the route paths defined in
// app.routes.ts — keep this list in sync if a new top-level route is added.
export type NavDestination = '/sale' | '/products' | '/sales' | '/buyers' | '/payment';

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  '/sale',
  '/products',
  '/sales',
  '/buyers',
  '/payment',
];
