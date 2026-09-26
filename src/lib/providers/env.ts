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
    // The same module runs in two places, so the advice has to cover both:
    // a script reads .env from disk, a deployed function reads project
    // environment variables that .env never reaches.
    const where =
      hint ??
      `Locally: add it to .env in the project root. On Vercel: ` +
        `\`vercel env add ${name} production\`, then redeploy - .env is ` +
        `gitignored and never reaches the deployment.`;
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
