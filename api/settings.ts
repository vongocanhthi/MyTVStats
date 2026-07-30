import { PACKAGE_NAME_EXPORT } from "./_lib/play";

export const config = {
  runtime: "nodejs",
};

export default async function handler(): Promise<Response> {
  return Response.json({
    serviceAccountPath: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? "env" : null,
    packageName: PACKAGE_NAME_EXPORT,
  });
}
