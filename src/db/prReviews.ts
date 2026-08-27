import { pool } from "./pool";

export interface Issue {
    severity: "bug" | "style" | "suggestion";
    description: string;
}

export interface PrReviewRow {
    id: number;
    owner: string;
    repo: string;
    pr_number: number;
    status: string;
    last_reviewed_sha: string | null;
    last_comment_id: number | null;
    last_issues: Issue[];
}

export async function getPrReview(
    owner: string,
    repo: string,
    prNumber: number
): Promise<PrReviewRow | null> {
    const result = await pool.query(
        `SELECT * FROM pr_reviews WHERE owner = $1 AND repo=$2 AND pr_number=$3`,
        [owner, repo, prNumber]
    );
    return result.rows[0] ?? null;
}

export async function createPrReview(
    owner: string,
    repo: string,
    prNumber: number,
    sha: string,
    commentId: number,
    issues: Issue[]
): Promise<PrReviewRow | null> {
    const result = await pool.query(
        `INSERT INTO pr_reviews (owner, repo, pr_number, last_reviewed_sha, last_comment_id, last_issues)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [owner, repo, prNumber, sha, commentId, JSON.stringify(issues)]
    );
    return result.rows[0] ?? null;
}

export async function updatePrReview(
    id: number,
    sha: string,
    commentId: number,
    issues: Issue[]
): Promise<PrReviewRow> {
    const result = await pool.query(
        `UPDATE pr_reviews
     SET last_reviewed_sha = $1,
         last_comment_id = $2,
         last_issues = $3,
         updated_at = now()
     WHERE id = $4
     RETURNING *`,
        [sha, commentId, JSON.stringify(issues), id]
    );

    return result.rows[0];
}

export async function updatePrStatus(
    owner: string,
    repo: string,
    prNumber: number,
    status: "open" | "closed" | "merged"
): Promise<void> {
    await pool.query(
        `UPDATE pr_reviews SET status = $1, updated_at = now()
     WHERE owner = $2 AND repo = $3 AND pr_number = $4`,
        [status, owner, repo, prNumber]
    );
}