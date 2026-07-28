import { fetchRecentReviews } from "./_lib/play";
import { buildStats } from "./_lib/stats";

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

export default async function handler(): Promise<Response> {
  try {
    const reviews = await fetchRecentReviews();
    const stats = buildStats(reviews);
    return Response.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}
