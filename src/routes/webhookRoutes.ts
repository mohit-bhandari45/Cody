import { Router, Request, Response } from "express";
import { verifyGithubSignature } from "../verifySignature";
import { updatePrStatus } from "../db/prReviews";
import { resolveInstallationId } from "../helpers/helper";
import { reviewQueue } from "../queue/reviewQueue";
import { parseSlashCommand } from "../github/commandParser";
import { handleSlashCommand } from "../github/commandHandler";

export const webhookRouter = Router();

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";
const isProduction = process.env.NODE_ENV === "production" || process.env.RENDER === "true";
const authMode: "app" | "token" = isProduction ? "app" : "token";

webhookRouter.post("/", async (req: Request, res: Response) => {
    const signature = req.header("x-hub-signature-256");
    const event = req.header("x-github-event");
    const rawBody = (req as any).rawBody as Buffer;

    const isValid = verifyGithubSignature(rawBody, signature, WEBHOOK_SECRET);
    if (!isValid) {
        console.warn("Rejected webhook: invalid or missing signature");
        return res.status(401).json({ error: "Invalid signature" });
    }

    res.status(200).json({ received: true });

    if (event === "issue_comment") {
        const action = req.body.action;
        const issue = req.body.issue;
        const comment = req.body.comment;
        const repo = req.body.repository;

        if (action !== "created" || !issue.pull_request) {
            return;
        }

        if (comment.user?.type === "Bot") {
            return;
        }

        const command = parseSlashCommand(comment.body);
        if (!command) return;

        console.log(`[slash_command:${command.type}] PR #${issue.number} by @${comment.user.login}`);
        const installationId = resolveInstallationId(req.body);

        await handleSlashCommand({
            command,
            owner: repo.owner.login,
            repo: repo.name,
            pullNumber: issue.number,
            commentId: comment.id,
            commentBody: comment.body,
            userLogin: comment.user.login,
            installationId: installationId || 0,
            authMode,
        });

        return;
    }

        // Handle inline code diff comments (Files Changed tab)
    if (event === "pull_request_review_comment") {
        const action = req.body.action;
        const pullRequest = req.body.pull_request;
        const comment = req.body.comment;
        const repo = req.body.repository;

        if (action !== "created" || comment.user?.type === "Bot") {
            return;
        }

        const command = parseSlashCommand(comment.body);
        if (!command) return;

        console.log(`[inline_slash_command:${command.type}] PR #${pullRequest.number} ${comment.path}:${comment.line || comment.original_line}`);
        const installationId = resolveInstallationId(req.body);

        await handleSlashCommand({
            command,
            owner: repo.owner.login,
            repo: repo.name,
            pullNumber: pullRequest.number,
            commentId: comment.id,
            commentBody: comment.body,
            userLogin: comment.user.login,
            installationId: installationId || 0,
            authMode,
            isInline: true,
            filePath: comment.path,
            line: comment.line || comment.original_line,
            diffHunk: comment.diff_hunk,
        });

        return;
    }

    if (event !== "pull_request") {
        console.log(`Ignore event: ${event}`);
        return;
    }

    const action = req.body.action;
    const pr = req.body.pull_request;
    const repo = req.body.repository;

    if (action === "closed") {
        const newStatus = pr.merged ? "merged" : "closed";
        await updatePrStatus(repo.owner.login, repo.name, pr.number, newStatus);
        console.log(`PR #${pr.number} marked as ${newStatus}`);
        return;
    }

    if (action === "reopened") {
        await updatePrStatus(repo.owner.login, repo.name, pr.number, "open");
        console.log(`PR #${pr.number} reopened`);
        return;
    }

    if (action !== "opened" && action !== "synchronize") {
        console.log(`Ignore pull_request action: ${action}`);
        return;
    }

    console.log(`[pull_request:${action}] ${repo.full_name} #${pr.number} — "${pr.title}"`);

    const installationId = resolveInstallationId(req.body);
    const mode = isProduction ? "production" : "local";

    console.log("Webhook event:", {
        event,
        action,
        repo: repo?.full_name,
        pullNumber: pr?.number,
        installationId,
        authMode,
        mode,
        hasInstallation: !!req.body.installation,
        sender: req.body.sender?.login,
    });

    if (isProduction && !installationId) {
        console.warn("Skipping production review job: no installation.id found on GitHub App webhook payload.");
        return;
    }

    try {
        await reviewQueue.add(
            "review-pr",
            {
                owner: repo.owner.login,
                repo: repo.name,
                pullNumber: pr.number,
                headSha: pr.head.sha,
                installationId,
                authMode,
            },
            {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 5000,
                },
            }
        );

        console.log(`Enqueued review job for #${pr.number}`);
    } catch (err) {
        console.error("Failed to enqueue review job:", err);
    }
});
