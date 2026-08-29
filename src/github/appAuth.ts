import "dotenv/config";
import { createAppAuth } from "@octokit/auth-app";
import { normalizePrivateKey } from "./helper";

export type GitHubAuthMode = "app" | "token";

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