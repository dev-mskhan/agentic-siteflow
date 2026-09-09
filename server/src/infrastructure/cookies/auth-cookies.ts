import type { Request, Response } from "express";

/**
 * Cookie names used for HttpOnly token storage.
 * Keeping them in one place ensures set/clear/read are always consistent.
 */
export const ACCESS_TOKEN_COOKIE = "sf_access_token";
export const REFRESH_TOKEN_COOKIE = "sf_refresh_token";

/**
 * The client opts into cookie mode by sending this request header.
 * API / mobile clients omit the header and receive tokens in the JSON body as before.
 */
const COOKIE_MODE_HEADER = "x-use-cookies";

/** Returns true when the request opts into HttpOnly cookie token delivery. */
export function isCookieMode(req: Request): boolean {
  return req.headers[COOKIE_MODE_HEADER] === "1";
}

/**
 * Write both tokens as HttpOnly cookies on the response.
 *
 * Security attributes:
 *  - HttpOnly   — not accessible via document.cookie / XSS
 *  - Secure     — only sent over HTTPS (omitted in development)
 *  - SameSite=Strict — prevents CSRF for same-origin requests
 *
 * The access token cookie uses a short Max-Age matching the JWT expiry (15 min default).
 * The refresh token cookie uses a longer Max-Age matching the session expiry (7 days default).
 */
export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  isProduction = process.env["NODE_ENV"] === "production",
): void {
  const base = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict" as const,
    path: "/",
  };

  // Access token — 15 minutes
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    ...base,
    maxAge: 15 * 60 * 1000,
  });

  // Refresh token — 7 days
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...base,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

/**
 * Clear both auth cookies (used on logout).
 */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: "/" });
}

/**
 * Read the access token from the cookie jar.
 * Returns undefined if the cookie is absent.
 */
export function getAccessTokenCookie(req: Request): string | undefined {
  return req.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;
}

/**
 * Read the refresh token from the cookie jar.
 * Returns undefined if the cookie is absent.
 */
export function getRefreshTokenCookie(req: Request): string | undefined {
  return req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
}
