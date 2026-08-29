import "dotenv/config";
import { Job, Worker } from "bullmq";
import { fetchPullRequestFiles, postPullRequestComment, compareCommits, postReviewComments } from "../github/githubapis";
import { combineFilesIntoDiffText, formatReviewComment, formatIncrementalReviewComment } from "../github/helper";
import { reviewDiff } from "../llm/client";
import { compareIssues } from "../llm/compareIssues";
import { connection } from "./connection";
import { publishJobUpdate } from "./publisher";
import { getPrReview, createPrReview, updatePrReview } from "../db/prReviews";
import { insertReviewRun } from "../db/reviewRuns";

interface ReviewJobData {
    owner: string;
    repo: string;
    pullNumber: number;
    headSha: string;
    installationId: number
}

async function processReviewJob(job: Job<ReviewJobData>) {
    const { owner, repo, pullNumber, headSha, installationId } = job.data;

    console.log(`Processing job ${job.id}: ${owner}/${repo} #${pullNumber}`);
    publishJobUpdate({ jobId: job.id!, stage: "started", data: { owner, repo, pullNumber } });

    const existingRow = await getPrReview(owner, repo, pullNumber);

    let files;
    let isIncremental = false;

    if (existingRow && existingRow.last_reviewed_sha) {
        const compareResult = await compareCommits(owner, repo, existingRow.last_reviewed_sha, headSha, installationId);

        if (compareResult !== null) {
            files = compareResult;
            isIncremental = true;
            console.log(`Incremental diff: ${existingRow.last_reviewed_sha} -> ${headSha}`);
        } else {
            console.log("Falling back to full diff (force-push or rebase detected).");
            files = await fetchPullRequestFiles(owner, repo, pullNumber, installationId);
        }
    } else {
        files = await fetchPullRequestFiles(owner, repo, pullNumber, installationId);
        console.log(`First review for this PR — full diff.`);
    }

    console.log(`Fetched ${files.length} changed file(s).`);
    publishJobUpdate({ jobId: job.id!, stage: "fetched", data: { fileCount: files.length } });

    if (files.length === 0) {
        console.log("No meaningful changes in this diff — skipping LLM call.");
        return;
    }

    const combinedDiff = combineFilesIntoDiffText(files);
    const review = await reviewDiff(combinedDiff);

    console.log("Review summary:", review.summary);
    console.log("Issues found:", review.issues);
    publishJobUpdate({ jobId: job.id!, stage: "reviewed", data: { issueCount: review.issues.length } });

    const lineableIssues = review.issues.filter((i) => i.file && typeof i.line === "number");
    const nonLineableIssues = review.issues.filter((i) => !i.file && typeof i.line !== "number");

    let failedInlineIssues: typeof review.issues = [];
    if (lineableIssues.length > 0) {
        const inlineComments = lineableIssues.map((i) => ({
            file: i.file!,
            line: i.line!,
            body: `**[${i.severity}]** ${i.description}`,
        }));

        const result = await postReviewComments(
            owner, repo, pullNumber, headSha, inlineComments, installationId
        );

        console.log(`Inline comments: ${result.posted} posted, ${result.failed.length} failed.`);

        failedInlineIssues = lineableIssues.filter((i) =>
            result.failed.some((f) => f.file === i.file && f.line === i.line)
        );
    }

    const issuesForSummary = [...nonLineableIssues, ...failedInlineIssues];
    const summaryReview = { summary: review.summary, issues: issuesForSummary };

    let commentBody: string = "";
    if (isIncremental && existingRow) {
        const comparison = compareIssues(existingRow.last_issues, summaryReview.issues);
        commentBody = formatIncrementalReviewComment(summaryReview.summary, comparison);
    } else {
        commentBody = formatReviewComment(summaryReview);
    }

    const commentId = await postPullRequestComment(owner, repo, pullNumber, commentBody, installationId);
    console.log(`Posted review comment for #${pullNumber} (comment ID: ${commentId})`);

    let prReviewId: number;

    if (existingRow) {
        const updated = await updatePrReview(existingRow.id, headSha, commentId, review.issues);
        prReviewId = updated.id;
    } else {
        const created = await createPrReview(owner, repo, pullNumber, headSha, commentId, review.issues);
        prReviewId = (created!).id;
    }

    const runResult = await insertReviewRun(
        prReviewId, headSha, commentId, review.summary, review.issues, files.length
    );

    if (!runResult.inserted) {
        console.log("This exact commit was already reviewed (retry detected) — state still updated safely.");
    }

    publishJobUpdate({ jobId: job.id!, stage: "completed" });
}

const worker = new Worker<ReviewJobData>("review-queue", processReviewJob, {
    connection,
    concurrency: 2,
});

worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed successfully.`);
});

worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
});

console.log("Worker started, listening for review jobs...");