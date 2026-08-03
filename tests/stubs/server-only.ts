/**
 * No-op stand-in for the `server-only` package.
 *
 * The real module throws when imported outside a React Server Component, which
 * would make server-side modules (report builders, queries) untestable. Vitest
 * aliases `server-only` here — see vitest.config.ts. Production builds still
 * use the real package, so the server-only guarantee is unchanged.
 */
export {};
