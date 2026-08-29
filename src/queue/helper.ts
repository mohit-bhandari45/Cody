import { ReviewResult } from "../llm/client";

const SEVERITY_RANK: Record<string, number> = {
    suggestion: 0,
    style: 1,
    bug: 2
};

export function filterBySeverity(issues: ReviewResult["issues"],minSeverity: string) {
    const minRank = SEVERITY_RANK[minSeverity];
    return issues.filter((issue) =>  SEVERITY_RANK[issue.severity] >= minRank);
}