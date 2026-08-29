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

export function combineFilesIntoDiffText(
    files: { filename: string, patch?: string }[]
): string {
    const relevantFiles = files.filter((f) => {
        if (!f.patch) return false;

        if (isNoiseFile(f.filename)) {
            console.log(`Skipping noise file: ${f.filename}`);
            return false;
        }

        return true;
    });

    let combined = "";
    let truncated = false;

    for (const file of relevantFiles) {
        const block = `File: ${file.filename}\n${file.patch}\n\n`;

        if (combined.length + block.length > MAX_DIFF_CHARACTERS) {
            truncated = true;
            break;
        }

        combined += block;
    }

    if (truncated) {
        combined += `\n[Note: diff truncated — PR too large to review in full. ${relevantFiles.length} file(s) changed; only a subset shown above.]`;
        console.log("Diff truncated due to size limit.");
    }

    return combined;
}

export function formatReviewComment(review: ReviewResult): string {
    const header = `## 🤖 AI Review\n\n${review.summary}`;

    if (review.issues.length === 0) {
        return `${header}\n\n✅ No issues found.`;
    }

    const issueLines = review.issues
        .map((issue) => `- **[${issue.severity}]** ${issue.description}`)
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