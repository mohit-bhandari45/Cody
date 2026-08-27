import "dotenv/config";
import { getPrReview, createPrReview, updatePrReview } from "./db/prReviews";
import { insertReviewRun } from "./db/reviewRuns";

async function main() {
  let row = await getPrReview("mohit-bhandari45", "pr-bot-test-repo", 1);

  if (!row) {
    row = await createPrReview(
      "mohit-bhandari45", "pr-bot-test-repo", 1,
      "aaa111", 123456,
      [{ severity: "bug", description: "test issue" }]
    );
    console.log("Created:", row);
  } else {
    console.log("Found existing:", row);
  }

  const runResult = await insertReviewRun(
    row.id, row.last_reviewed_sha!, row.last_comment_id!,
    "Test summary", row.last_issues, 1
  );
  console.log("Insert review run result:", runResult);

  // Try inserting the SAME commit again — should be rejected as duplicate
  const duplicateResult = await insertReviewRun(
    row.id, row.last_reviewed_sha!, row.last_comment_id!,
    "Test summary again", row.last_issues, 1
  );
  console.log("Duplicate insert result:", duplicateResult);

  const updated = await updatePrReview(row.id, "bbb222", 999999, [
    { severity: "suggestion", description: "new fake issue" },
  ]);
  console.log("Updated row:", updated);
}

main().then(() => process.exit(0));