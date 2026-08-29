import { createAppAuth } from "@octokit/auth-app";
import "dotenv/config";

export function normalizePrivateKey(value: string | undefined): string {
  if (!value) {
    throw new Error("GITHUB_APP_PRIVATE_KEY is not set.");
  }

  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .trim();
}

const privateKey = normalizePrivateKey(process.env.GITHUB_APP_PRIVATE_KEY);

const auth = createAppAuth({
  appId: process.env.GITHUB_APP_ID!,
  privateKey,
});

export async function getInstallationToken(installationId: number): Promise<string> {
  const { token } = await auth({
    type: "installation",
    installationId,
  });

  return token;
}