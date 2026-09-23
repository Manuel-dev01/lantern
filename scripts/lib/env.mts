/**
 * Environment access for the generation scripts.
 *
 * Scripts are run with `node --env-file=.env`, so everything here reads from
 * `process.env` and fails loudly rather than sending an unauthenticated
 * request and puzzling over a 401.
 */

export function requireEnv(name: string, hint?: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    const where =
      hint ??
      `Add it to .env in the project root, then re-run. Scripts are launched ` +
        `with \`node --env-file=.env\`.`;
    throw new Error(
      `Missing ${name}.\n${where}\nA value that is present but empty counts as missing.`,
    );
  }
  return value.trim();
}

/** True when the variable is set to something non-empty. */
export function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}
