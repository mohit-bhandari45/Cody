import { Issue } from "../db/prReviews";

export interface IssueComparison {
  newIssues: Issue[];
  resolvedIssues: Issue[];
  stillPresent: Issue[];
}

function issuesMatch(a: Issue, b: Issue): boolean {
  if (a.severity !== b.severity) return false;

  // Rough similarity: same severity + shares a meaningful chunk of wording.
  // Not perfect, but good enough for a v1 — see note in project plan.
  const wordsA = new Set(a.description.toLowerCase().split(/\W+/).filter(w => w.length > 4));
  const wordsB = new Set(b.description.toLowerCase().split(/\W+/).filter(w => w.length > 4));
  const shared = [...wordsA].filter(w => wordsB.has(w));

  return shared.length >= 2;
}

export function compareIssues(
    previousIssues: Issue[], currentIssues: Issue[]
): IssueComparison {
    const newIssues: Issue[] = [];
    const stillPresent: Issue[] = [];
    const resolvedIssues: Issue[] = [];

    for(const current of currentIssues) {
        const matched = previousIssues.some((prev) => issuesMatch(prev, current));
        if(matched) {
            stillPresent.push(current);
        }else{
            newIssues.push(current);
        }
    }

    for(const prev of previousIssues) {
        const stillExists = currentIssues.some((current) => issuesMatch(prev, current));
        if(!stillExists) {
            resolvedIssues.push(prev);
        }
    }

    return { newIssues, resolvedIssues, stillPresent };
}