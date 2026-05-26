// Every public Convex function carries a shared secret that we verify here, so the
// database is reachable only by our own Vercel API — never directly from the public
// internet, even though the functions are technically callable over HTTP.
//
// Set it on the Convex deployment with:  npx convex env set BACKEND_SECRET <value>
// (use the same value as the CONVEX_BACKEND_SECRET env var on Vercel).
export function assertBackend(secret: string | undefined): void {
  const expected = process.env.BACKEND_SECRET;
  if (!expected) {
    throw new Error("BACKEND_SECRET is not configured on the Convex deployment");
  }
  if (secret !== expected) {
    throw new Error("Unauthorized");
  }
}
