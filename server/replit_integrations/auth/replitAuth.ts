import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoize";
import ConnectPgSimple from "connect-pg-simple";
import { pool } from "../../db";
import { authStorage } from "./storage";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

const getOidcConfig = memoize(async () => {
  return await client.discovery(
    new URL(process.env.REPLIT_OIDC_ISSUER ?? "https://replit.com/oidc"),
    process.env.REPLIT_OIDC_CLIENT_ID ?? process.env.REPL_ID!
  );
});

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 7 days
  const PgStore = ConnectPgSimple(session);
  const sessionStore = new PgStore({
    pool,
    createTableIfMissing: false,
    ttl: sessionTtl,
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
      sameSite: "lax",
    },
    store: sessionStore,
  });
}

export function updateUserSession(
  user: Express.User,
  tokens: client.TokenEndpointResponse
) {
  const claims = tokens.claims();
  if (!claims) return;
  user.claims = {
    sub: claims.sub,
    email: claims.email as string | undefined,
    first_name: claims.first_name as string | undefined,
    last_name: claims.last_name as string | undefined,
    profile_image_url: claims.profile_image_url as string | undefined,
    name: claims.name as string | undefined,
  };
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = tokens.expires_in
    ? Math.floor(Date.now() / 1000) + tokens.expires_in
    : undefined;
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse,
    verified: passport.AuthenticateCallback
  ) => {
    const user: Express.User = {};
    updateUserSession(user, tokens);
    try {
      const claims = user.claims;
      if (!claims?.sub) {
        return verified(null, false);
      }
      await authStorage.upsertUser({
        id: claims.sub,
        email: claims.email ?? null,
        firstName: claims.first_name ?? claims.name ?? null,
        lastName: claims.last_name ?? null,
        profileImageUrl: claims.profile_image_url ?? null,
      });
      return verified(null, user);
    } catch (e) {
      return verified(e as Error);
    }
  };

  const domains = process.env.REPLIT_DOMAINS!.split(",");
  for (const domain of domains) {
    const strategy = new Strategy(
      {
        config,
        scope: "openid email profile",
        callbackURL: `https://${domain.trim()}/api/callback`,
      },
      verify
    );
    passport.use(`replitauth:${domain.trim()}`, strategy);
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));
}
