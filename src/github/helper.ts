import { ReviewResult } from "../llm/client";

export function combineFilesIntoDiffText(
    files: { filename: string, patch?: string }[]
): string {
    return files
        .filter((f) => f.patch)
        .map((f) => `File: ${f.filename}\n${f.patch}`)
        .join("\n\n")
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