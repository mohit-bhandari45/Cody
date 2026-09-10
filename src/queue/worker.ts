import { Job, Worker } from "bullmq";
import "dotenv/config";
import { createPrReview, getPrReview, updatePrReview } from "../db/prReviews";
import { insertReviewRun } from "../db/reviewRuns";
import type { GitHubAuthMode } from "../github/appAuth";
import { compareCommits, fetchPullRequestFiles, postPullRequestComment, postReviewComments } from "../github/githubapis";
import { chunkFilesIntoBatches, formatReviewComment, formatIncrementalReviewComment } from "../github/helper";
import { getRepoConfig } from "../github/repoConfig";
import { ReviewResult, reviewWithGemini, reviewWithGroq } from "../llm/client";
import { compareIssues } from "../llm/compareIssues";
import { connection } from "./connection";
import { filterBySeverity } from "./helper";
import { publishJobUpdate } from "./publisher";
import { getRepoSettings } from "../db/repoSettings";

interface ReviewJobData {
    owner: string;
    repo: string;
    pullNumber: number;
    headSha: string;
    installationId?: number;
    authMode: GitHubAuthMode;
}

async function processReviewJob(job: Job<ReviewJobData>) {
    const { owner, repo, pullNumber, headSha, installationId, authMode } = job.data;

    // publish the job update first
    console.log(`Processing job ${job.id}: ${owner}/${repo} #${pullNumber}`);
    publishJobUpdate({ jobId: job.id!, stage: "started", data: { owner, repo, pullNumber } });

    // Fetch both repo YAML config and DB Settings
    const yamlConfig = await getRepoConfig(owner, repo, authMode, installationId!);
    const dbSettings = await getRepoSettings(owner, repo);

    // merge them both
    const config = {
        ...yamlConfig,
        minSeverity: dbSettings?.min_severity || yamlConfig.minSeverity,
        inlineComments: dbSettings?.inline_comments || yamlConfig.inlineComments,
        maxDiffCharacters: dbSettings?.max_diff_characters || yamlConfig.maxDiffCharacters,
        ignoreFiles: [...(yamlConfig.ignoreFiles || []), ...(dbSettings?.ignore_files || []) || []]
    }

    // get previous review.
    const existingRow = await getPrReview(owner, repo, pullNumber);

    let files;
    let isIncremental = false;

    // check if there are existing reviews and it has last reviewed sha
    if (existingRow && existingRow.last_reviewed_sha) {
        // compare the commits
        const compareResult = await compareCommits(owner, repo, existingRow.last_reviewed_sha, headSha, authMode, installationId);

        if (compareResult !== null) {
            files = compareResult;
            isIncremental = true;
            console.log(`Incremental diff: ${existingRow.last_reviewed_sha} -> ${headSha}`);
        } else {
            console.log("Falling back to full diff (force-push or rebase detected).");
            files = await fetchPullRequestFiles(owner, repo, pullNumber, authMode, installationId);
        }
    } else {
        files = await fetchPullRequestFiles(owner, repo, pullNumber, authMode, installationId);
        console.log(`First review for this PR — full diff.`);
    }

    console.log(`Fetched ${files.length} changed file(s).`);
    publishJobUpdate({ jobId: job.id!, stage: "fetched", data: { fileCount: files.length } });

    if (files.length === 0) {
        console.log("No meaningful changes in this diff — skipping LLM call.");
        return;
    }

    const diffChunks = chunkFilesIntoBatches(files, config.maxDiffCharacters, config.ignoreFiles);
    console.log(`Split PR into ${diffChunks.length} chunk(s) for the LLMs.`);

    if (!dbSettings || (!dbSettings.gemini_api_key && !dbSettings.groq_api_key)) {
        console.warn(`[BYOK Enforced] Skipping review for ${owner}/${repo} #${pullNumber}: Missing API keys.`);

        await postPullRequestComment(
            owner, repo, pullNumber,
            "⚠️ **AI Review Skipped**: No API key configured for this repository. Please visit the bot dashboard to configure your API key.",
            authMode, installationId
        );
        return;
    }
    const geminiReviews = dbSettings.gemini_api_key
        ? await Promise.all(diffChunks.map(chunk => reviewWithGemini(chunk, dbSettings.gemini_api_key!)))
        : [];

    const groqReviews = dbSettings.groq_api_key
        ? await Promise.all(diffChunks.map(chunk => reviewWithGroq(chunk, dbSettings.groq_api_key!)))
        : [];

    let allGeminiIssues = geminiReviews.flatMap(r => r.issues);
    let allGroqIssues = groqReviews.flatMap(r => r.issues);

    allGeminiIssues = filterBySeverity(allGeminiIssues, config.minSeverity);
    allGroqIssues = filterBySeverity(allGroqIssues, config.minSeverity);

    const summaryParts: string[] = [];
    if (geminiReviews.length > 0) {
        summaryParts.push(`**Gemini Insight:** \n${geminiReviews.map(r => r.summary).join("\n")}`);
    }
    if (groqReviews.length > 0) {
        summaryParts.push(`**Groq (Llama 3) Insight:** \n${groqReviews.map(r => r.summary).join("\n")}`);
    }

    const review: ReviewResult = {
        summary: summaryParts.join("\n\n"),
        issues: [...allGeminiIssues, ...allGroqIssues]
    };

    console.log("Review summary:", review.summary);
    console.log("Issues found:", review.issues);
    publishJobUpdate({ jobId: job.id!, stage: "reviewed", data: { issueCount: review.issues.length } });

    const lineableIssues = config.inlineComments
        ? review.issues.filter((i) => i.file && typeof i.line === "number")
        : [];
    const nonLineableIssues = config.inlineComments
        ? review.issues.filter((i) => !i.file || typeof i.line !== "number")
        : review.issues;

    let failedInlineIssues: typeof review.issues = [];
    if (lineableIssues.length > 0) {
        const inlineComments = lineableIssues.map((i) => ({
            file: i.file!,
            line: i.line!,
            body: `**[${i.severity}]** ${i.description}`,
        }));

        const result = await postReviewComments(
            owner, repo, pullNumber, headSha, inlineComments, authMode, installationId
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

    const commentId = await postPullRequestComment(owner, repo, pullNumber, commentBody, authMode, installationId);
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
    // console.error(`Job ${job?.id} failed:`, err.message);
    console.error(`Job ${job?.id} failed:`);
    console.error(err);
    console.error(err.stack);
});

console.log("Worker started, listening for review jobs...");