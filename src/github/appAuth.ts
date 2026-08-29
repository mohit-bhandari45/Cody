import { createAppAuth } from "@octokit/auth-app";
import "dotenv/config";

export type GitHubAuthMode = "app" | "token";

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

const appAuth = createAppAuth({
  appId: process.env.GITHUB_APP_ID!,
  privateKey,
});

export async function getInstallationToken(installationId: number): Promise<string> {
  const { token } = await appAuth({
    type: "installation",
    installationId,
  });

  return token;
}

export function getPersonalAccessToken(): string {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error("GITHUB_TOKEN is not set for local token auth.");
  }

  return token;
}