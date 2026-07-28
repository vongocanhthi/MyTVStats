import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GoogleAuth } from "google-auth-library";
import type { Review } from "./types";

const PACKAGE_NAME = "vn.mytvnet.mobileb2c";
const PLAY_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const REVIEWS_URL =
  "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
export const RECENT_WINDOW_DAYS = 7;

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function loadServiceAccount(): ServiceAccount {
  const fromEnv = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (fromEnv) {
    return JSON.parse(fromEnv) as ServiceAccount;
  }

  const candidates = [
    join(process.cwd(), "src-tauri/credentials/service_account.json"),
    join(process.cwd(), "credentials/service_account.json"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf8")) as ServiceAccount;
    }
  }
  throw new Error(
    "Thiếu GOOGLE_SERVICE_ACCOUNT_JSON hoặc file src-tauri/credentials/service_account.json",
  );
}

async function getAccessToken(credentials: ServiceAccount): Promise<string> {
  const auth = new GoogleAuth({
    credentials,
    scopes: [PLAY_SCOPE],
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  if (!accessToken.token) {
    throw new Error("Không lấy được access token cho Google Play API");
  }
  return accessToken.token;
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

  const now = Math.floor(Date.now() / 1000);

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
    syncedAt: now,
  };
}

export async function fetchRecentReviews(): Promise<Review[]> {
  const credentials = loadServiceAccount();
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
