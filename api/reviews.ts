import { fetchRecentReviews } from "./_lib/play";
import { listReviews } from "./_lib/stats";

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

export default async function handler(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const reviews = await fetchRecentReviews();
    const page = listReviews(reviews, {
      page: num(url.searchParams.get("page")),
      pageSize: num(url.searchParams.get("pageSize")),
      search: url.searchParams.get("search") ?? undefined,
      minRating: num(url.searchParams.get("minRating")),
      maxRating: num(url.searchParams.get("maxRating")),
      versionName: url.searchParams.get("versionName") ?? undefined,
      sortBy: url.searchParams.get("sortBy") ?? undefined,
      sortOrder: url.searchParams.get("sortOrder") ?? undefined,
    });
    return Response.json(page);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

function num(value: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
