import React from "react";

export interface ReviewRun {
  id: number;
  pr_number: number;
  commit_sha: string;
  summary: string;
  issues: any[];
  file_count: number;
  created_at: string;
}

interface ReviewHistoryProps {
  reviews: ReviewRun[];
  isLoading: boolean;
}

export const ReviewHistory: React.FC<ReviewHistoryProps> = ({ reviews, isLoading }) => {
  if (isLoading) {
    return (
      <div className="card">
        <div style={{ color: "var(--text-muted)", fontFamily: "var(--mono)", fontSize: "0.85rem" }}>
          Loading review history...
        </div>
      </div>
    );
  }

  const reviewList = Array.isArray(reviews) ? reviews : [];

  if (reviewList.length === 0) {
    return (
      <div className="card">
        <div style={{ color: "var(--text-muted)", fontFamily: "var(--mono)", fontSize: "0.85rem" }}>
          No PR reviews recorded yet for this repository.
        </div>
      </div>
    );
  }

  return (
    <div>
      {reviewList.map((r) => (
        <div key={r.id} className="review-item">
          <div className="review-header">
            <span>
              PR #{r.pr_number} — <span className="sha">{r.commit_sha ? r.commit_sha.slice(0, 7) : "N/A"}</span>
            </span>
            <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
              {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
            </span>
          </div>
          <div className="review-summary">{r.summary || "No summary recorded"}</div>
        </div>
      ))}
    </div>
  );
};
