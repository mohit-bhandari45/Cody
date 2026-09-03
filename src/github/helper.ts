import { ReviewResult } from "../llm/client";
import { IssueComparison } from "../llm/compareIssues";
import { getInstallationToken, getPersonalAccessToken, GitHubAuthMode } from "./appAuth";

const MAX_DIFF_CHARACTERS = 12000;
const IGNORERD_FILE_PATTERNS: RegExp[] = [
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /\.min\.js$/,
    /\.min\.css$/,
    /dist\//,
    /build\//,
    /node_modules\//,
    /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/,
]

/**
 * Appauth helpers
 */
export function normalizePrivateKey(value: string | undefined): string {
    if (!value) {
        throw new Error("GITHUB_APP_PRIVATE_KEY is not set.");
    }

    return value
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "")
        .trim();
}

/**
 * Github apis helpers
 */
export async function resolveToken(authMode: GitHubAuthMode, installationId?: number): Promise<string> {
    if (authMode === "token") {
        return getPersonalAccessToken();
    }

    if (!installationId) {
        throw new Error("installationId is required when authMode is 'app'.");
    }

    return getInstallationToken(installationId);
}

/**
 * Helper function to ignoring large diff files with bad patch
 */
function isNoiseFile(filename: string): boolean {
    return IGNORERD_FILE_PATTERNS.some((pattern) => pattern.test(filename));
}

function globToRegex(pattern: string): RegExp {
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
    return new RegExp(`${escaped}$`);
}

export function chunkFilesIntoBatches(
    files: { filename: string, patch?: string }[],
    maxChunkSize: number = 20000,
    extraIgnorePatterns: string[] = []
): string[] {
    const extraRegexes = extraIgnorePatterns.map((pattern) => globToRegex(pattern));

    const relevantFiles = files.filter((f) => {
        if (!f.patch) return false;

        if (isNoiseFile(f.filename) || extraRegexes.some((r) => r.test(f.filename))) {
            console.log(`Skipping noise file: ${f.filename}`);
            return false;
        }

        return true;
    });

    const chunks: string[] = [];
    let currentChunk = "";

    for (const file of relevantFiles) {
        const block = `File: ${file.filename}\n${file.patch}\n\n`;

        if (currentChunk.length + block.length > maxChunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = "";
        }

        currentChunk += block;
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
}

export function formatReviewComment(review: ReviewResult): string {
    const header = `## 🤖 AI Review\n\n${review.summary}`;

    if (review.issues.length === 0) {
        return `${header}\n\n✅ No issues found.`;
    }

    const issueLines = review.issues
        .map((issue) => {
            const tag = issue.provider === "groq" ? "🦙 Llama 3" : "✨ Gemini";
            return `- **[${issue.severity}]** ${issue.description} *(${tag})*`;
        })
        .join("\n");

    return `${header}\n\n### Issues\n${issueLines}`
}

export function formatIncrementalReviewComment(
    summary: string,
    comparison: IssueComparison
): string {
    const sections: string[] = [`## 🤖 AI Review (updated)\n\n${summary}`];

    if (comparison.resolvedIssues.length > 0) {
        sections.push(
            `### ✅ Resolved since last review\n` +
            comparison.resolvedIssues.map(i => `- ~~[${i.severity}] ${i.description}~~`).join("\n")
        );
    }

    if (comparison.newIssues.length > 0) {
        sections.push(
            `### 🆕 New issues\n` +
            comparison.newIssues.map(i => `- **[${i.severity}]** ${i.description}`).join("\n")
        );
    }

    if (comparison.stillPresent.length > 0) {
        sections.push(
            `### ⚠️ Still present\n` +
            comparison.stillPresent.map(i => `- **[${i.severity}]** ${i.description}`).join("\n")
        );
    }

    if (comparison.newIssues.length === 0 && comparison.stillPresent.length === 0) {
        sections.push(`✅ No outstanding issues.`);
    }

    return sections.join("\n\n");
}