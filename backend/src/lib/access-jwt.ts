import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "../types";

const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";
const DEV_USER_ID = "dev@localhost";

/** Access signing keys, cached per team domain for the lifetime of the isolate. */
const jwksByTeamDomain = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(teamDomain: string) {
  let jwks = jwksByTeamDomain.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksByTeamDomain.set(teamDomain, jwks);
  }
  return jwks;
}

/**
 * Returns the authenticated user's ID (their email), or null if the request
 * carries no valid Cloudflare Access token.
 *
 * Access already blocks unauthenticated traffic at the edge; the signature,
 * issuer and audience are verified here as well so a request that reaches the
 * Worker some other way cannot forge an identity.
 */
export async function getUserId(request: Request, env: Env): Promise<string | null> {
  if (env.AUTH_ENABLED === "false") return DEV_USER_ID;

  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw new Error("ACCESS_TEAM_DOMAIN and ACCESS_AUD must be set when auth is enabled");
  }

  const token = request.headers.get(ACCESS_JWT_HEADER);
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwks(env.ACCESS_TEAM_DOMAIN), {
      issuer: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
    });
    return typeof payload.email === "string" && payload.email ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}
