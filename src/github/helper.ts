import { ReviewResult } from "../llm/client";

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
    })

    let combined = "";
    let truncated = false;

    for (const file of files) {
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
