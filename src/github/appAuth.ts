import { createAppAuth } from "@octokit/auth-app";
import fs from "fs";
import "dotenv/config";

const privateKey = fs.readFileSync(
  process.env.GITHUB_APP_PRIVATE_KEY_PATH!,
  "utf8"
);

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