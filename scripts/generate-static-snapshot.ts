import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fetchRecentReviews, PACKAGE_NAME_EXPORT } from "../api/_lib/play";
import { buildStats } from "../api/_lib/stats";

interface AppSettingsSnapshot {
  serviceAccountPath: string;
  packageName: string;
}

async function writeJson(targetPath: string, value: unknown): Promise<void> {
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const reviews = await fetchRecentReviews();
  const stats = buildStats(reviews);
  const settings: AppSettingsSnapshot = {
    serviceAccountPath: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? "env" : "bundled",
    packageName: PACKAGE_NAME_EXPORT,
  };

  const outputDir = resolve(process.cwd(), "public", "snapshots");
  await mkdir(outputDir, { recursive: true });

  await Promise.all([
    writeJson(resolve(outputDir, "reviews.json"), reviews),
    writeJson(resolve(outputDir, "stats.json"), stats),
    writeJson(resolve(outputDir, "settings.json"), settings),
  ]);

  console.log(`Generated snapshots in ${outputDir}`);
  console.log(`Reviews: ${reviews.length}`);
  console.log(`Last sync at: ${stats.lastSyncAt ?? "unknown"}`);
}

main().catch((error) => {
  console.error("Failed to generate snapshots:", error);
  process.exitCode = 1;
});
