import { createAppAuth } from "@octokit/auth-app";
import fs from "fs";
import "dotenv/config";

const privateKey = process.env.GITHUB_APP_PRIVATE_KEY!;

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