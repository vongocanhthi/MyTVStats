import type { ServiceAccountCredentials } from "./service-account-store";
import type { Review } from "./types";

const PACKAGE_NAME = "vn.mytvnet.mobileb2c";
const PLAY_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const REVIEWS_URL =
  "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const RECENT_WINDOW_DAYS = 7;

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/gu, "")
    .replace(/-----END PRIVATE KEY-----/gu, "")
    .replace(/\s/gu, "");
  const binary = atob(pemContents);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function createJwt(credentials: ServiceAccountCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    scope: PLAY_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await importPrivateKey(credentials.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function getAccessToken(credentials: ServiceAccountCredentials): Promise<string> {
  const jwt = await createJwt(credentials);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    throw new Error(`OAuth token error ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Không lấy được access token cho Google Play API");
  }
  return data.access_token;
}

function mapApiReview(api: Record<string, unknown>): Review | null {
  const comments = api.comments as Array<Record<string, unknown>> | undefined;
  const userComment = comments?.find((c) => c.userComment)?.userComment as
    | Record<string, unknown>
    | undefined;
  if (!userComment) return null;

  const starRating = userComment.starRating as number | undefined;
  if (starRating == null) return null;

  const lastModified = userComment.lastModified as { seconds?: string } | undefined;
  const lastModifiedAt = lastModified?.seconds
    ? Number.parseInt(lastModified.seconds, 10)
    : Math.floor(Date.now() / 1000);

  const developerReply = comments?.find((c) => c.developerComment)?.developerComment as
    | { text?: string }
    | undefined;

  const deviceMetadata = userComment.deviceMetadata as
    | { manufacturer?: string; deviceClass?: string }
    | undefined;

  return {
    reviewId: String(api.reviewId ?? ""),
    authorName: (api.authorName as string | undefined) ?? null,
    starRating,
    text: (userComment.text as string | undefined) ?? null,
    originalText: (userComment.originalText as string | undefined) ?? null,
    reviewerLanguage: (userComment.reviewerLanguage as string | undefined) ?? null,
    device: (userComment.device as string | undefined) ?? null,
    appVersionCode: (userComment.appVersionCode as number | undefined) ?? null,
    appVersionName: (userComment.appVersionName as string | undefined) ?? null,
    androidOsVersion: (userComment.androidOsVersion as number | undefined) ?? null,
    manufacturer: deviceMetadata?.manufacturer ?? null,
    deviceClass: deviceMetadata?.deviceClass ?? null,
    thumbsUp: (userComment.thumbsUpCount as number | undefined) ?? 0,
    thumbsDown: (userComment.thumbsDownCount as number | undefined) ?? 0,
    hasDeveloperReply: Boolean(developerReply?.text),
    developerReply: developerReply?.text ?? null,
    submittedAt: null,
    lastModifiedAt,
    source: "api",
  };
}

export async function fetchRecentReviews(
  credentials: ServiceAccountCredentials,
): Promise<Review[]> {
  const accessToken = await getAccessToken(credentials);
  const windowStart = Math.floor(Date.now() / 1000) - RECENT_WINDOW_DAYS * 24 * 60 * 60;

  const all: Review[] = [];
  let pageToken: string | undefined;

  for (;;) {
    let url = `${REVIEWS_URL}/${PACKAGE_NAME}/reviews?maxResults=100`;
    if (pageToken) url += `&token=${encodeURIComponent(pageToken)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Play API error ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as {
      reviews?: Array<Record<string, unknown>>;
      tokenPagination?: { nextPageToken?: string };
    };

    let anyRecent = false;
    for (const apiReview of payload.reviews ?? []) {
      const review = mapApiReview(apiReview);
      if (!review) continue;
      if (review.lastModifiedAt >= windowStart) {
        all.push(review);
        anyRecent = true;
      }
    }

    pageToken = payload.tokenPagination?.nextPageToken;
    if (!anyRecent || !pageToken) break;
  }

  return all;
}

export const PACKAGE_NAME_EXPORT = PACKAGE_NAME;
