import yaml from "js-yaml";
import { getInstallationToken, getPersonalAccessToken } from "./appAuth";

export interface RepoConfig {
    ignoreFiles: string[];
    minSeverity: "bug" | "style" | "suggestion";
    inlineComments: boolean;
    maxDiffCharacters: number;
    customPrompt?: string;
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

    const filesToTry = [".diffie.yml", ".diffie.yaml", ".pr-bot.yml"];

    for (const fileName of filesToTry) {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${fileName}`;
        try {
            const response = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            });

            if (!response.ok) continue;

            const data = await response.json();
            const decoded = Buffer.from(data.content, "base64").toString("utf-8");
            const parsed = yaml.load(decoded) as Partial<RepoConfig>;
            return { ...DEFAULT_CONFIG, ...parsed };
        } catch (error) {
            console.warn(`Failed to parse ${fileName} for ${owner}/${repo} — trying fallback.`);
        }
    }

    return DEFAULT_CONFIG;
}