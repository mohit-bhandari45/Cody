import "dotenv/config";
import express, { Request, Response } from "express";
import { verifyGithubSignature } from "./verifySignature";
import { fetchPullRequestFiles, postPullRequestComment } from "./github/githubapis";
import { combineFilesIntoDiffText, formatReviewComment } from "./github/helper";
import { reviewDiff } from "./llm/client";

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
    console.error("Missing GITHUB_WEBHOOK_SECRET in .env");
    process.exit(1);
}

app.use(
    express.json({
        verify: (req: Request, _res: Response, buf: Buffer) => {
            (req as any).rawBody = buf;
        },
    })
);

app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
});

app.post("/webhook", async (req: Request, res: Response) => {
    const signature = req.header("x-hub-signature-256");
    const event = req.header("x-github-event");
    const rawBody = (req as any).rawBody as Buffer;

    const isValid = verifyGithubSignature(rawBody, signature, WEBHOOK_SECRET);
    if (!isValid) {
        console.warn("Rejected webhook: invalid or missing signature");
        return res.status(401).json({ error: "Invalid signature" });
    }

    res.status(200).json({ received: true });

    if (event != "pull_request") {
        console.log(`Ignore event: ${event}`);
        return;
    }

    const action = req.body.action;
    if (action != "opened" && action != "synchronize") {
        console.log(`Ignore pull_request action: ${action}`);
        return;
    }

    const pr = req.body.pull_request;
    const repo = req.body.repository;

    console.log(`[pull_request:${action}] ${repo.full_name} #${pr.number} — "${pr.title}"`);

    try {
        const files = await fetchPullRequestFiles(
            repo.owner.login,
            repo.name,
            pr.number
        );

        console.log(`Fetched ${files.length} changed file(s):`);

        const combinedDiff = combineFilesIntoDiffText(files);
        const review = await reviewDiff(combinedDiff);

        console.log("Review summary:", review.summary);
        console.log("Issues found:", review.issues);

        const commentBody = formatReviewComment(review);
        await postPullRequestComment(
            repo.owner.login,
            repo.name,
            pr.number,
            commentBody
        );

        console.log("Posted review comment to PR.");
    } catch (err) {
        console.error("Failed to fetch PR files:", err);
    }
})

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});