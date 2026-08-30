import yaml from "js-yaml";
import { getInstallationToken, getPersonalAccessToken } from "./appAuth";

export interface RepoConfig {
    ignoreFiles: string[];
    minSeverity: "bug" | "style" | "suggestion";
    inlineComments: boolean;
    maxDiffCharacters: number;
}

const DEFAULT_CONFIG: RepoConfig = {
    ignoreFiles: [],
    minSeverity: "suggestion",
    inlineComments: true,
    maxDiffCharacters: 12000,
};

export async function getRepoConfig(
    owner: string,
    repo: string,
    authMode: string,
    installationId: number
): Promise<RepoConfig> {
    const token =
        authMode === "token"
            ? getPersonalAccessToken()
            : await getInstallationToken(installationId!);
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/.pr-bot.yml`;

    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
    });

    if (!response.ok) {
        return DEFAULT_CONFIG;
    }

    const data = await response.json();
    const decoded = Buffer.from(data.content, "base64").toString("utf-8");

    try {
        const parsed = yaml.load(decoded) as Partial<RepoConfig>;
        return { ...DEFAULT_CONFIG, ...parsed };
    } catch (error) {
        console.warn(`Failed to parse .pr-bot.yml for ${owner}/${repo} — using defaults.`);
        return DEFAULT_CONFIG;
    }
}