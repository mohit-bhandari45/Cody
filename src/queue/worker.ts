import { Job, Worker } from "bullmq";
import "dotenv/config";
import { fetchPullRequestFiles, postPullRequestComment } from "../github/githubapis";
import { combineFilesIntoDiffText, formatReviewComment } from "../github/helper";
import { reviewDiff } from "../llm/client";
import { connection } from "./connection";
import { publishJobUpdate } from "./publisher";

interface ReviewJobData {
    owner: string;
    repo: string;
    pullNumber: number;
}

async function processReviewJob(
    job: Job<ReviewJobData>
) {
    const { owner, repo, pullNumber } = job.data;

    console.log(`Processing job ${job.id}: ${owner}/${repo} #${pullNumber}`);
    publishJobUpdate({ jobId: job.id!, stage: "started", data: { owner, repo, pullNumber } });

    const files = await fetchPullRequestFiles(owner, repo, pullNumber);
    console.log(`Fetched ${files.length} changed file(s).`);
    publishJobUpdate({ jobId: job.id!, stage: "fetched", data: { fileCount: files.length } });

    const combinedDiff = combineFilesIntoDiffText(files);
    const review = await reviewDiff(combinedDiff);

    console.log("Review summary:", review.summary);
    console.log("Issues found:", review.issues);
    publishJobUpdate({ jobId: job.id!, stage: "reviewed", data: { issueCount: review.issues.length } });

    const commentBody = formatReviewComment(review);
    await postPullRequestComment(owner, repo, pullNumber, commentBody);
    publishJobUpdate({ jobId: job.id!, stage: "completed" });

    console.log(`Posted review comment for #${pullNumber}`);
}

const worker = new Worker<ReviewJobData>("review-queue", processReviewJob, { connection, concurrency: 2 });

worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed successfully.`);
});

worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
});

console.log("Worker started, listening for review jobs...");