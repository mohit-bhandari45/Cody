import { pool } from "./pool";
import { Issue } from "./prReviews";

export async function insertReviewRun(
    prReviewId: number,
    commitSha: string,
    commentId: number,
    summary: string,
    issues: Issue[],
    fileCount: number
): Promise<{ inserted: boolean }> {
    try {
        await pool.query(
            `INSERT INTO review_runs (pr_review_id, commit_sha, comment_id, summary, issues, file_count)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [prReviewId, commitSha, commentId, summary, JSON.stringify(issues), fileCount]
        );
        return { inserted: true };
    } catch (error: any) {
        if (error.code === "23505") {
            console.log(`Review run for commit ${commitSha} already exists — skipping duplicate.`);
            return { inserted: false };
        }

        return { inserted: false };
    }
}