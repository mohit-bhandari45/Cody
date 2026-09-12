// src/github/commandHandler.ts

import { DiffieCommand } from "./commandParser";
import { reviewQueue } from "../queue/reviewQueue";
import { resolveToken } from "./helper";
import { postPullRequestComment } from "./githubapis";
import { GitHubAuthMode } from "./appAuth";
import { getRepoSettings } from "../db/repoSettings";
import { explainConcept } from "../llm/client";

export interface CommandContext {
    command: DiffieCommand;
    owner: string;
    repo: string;
    pullNumber: number;
    commentId: number;
    commentBody: string;
    userLogin: string;
    installationId: number;
    authMode: GitHubAuthMode;
    isInline?: boolean;
    filePath?: string;
    line?: number;
    diffHunk?: string;
}

export async function handleSlashCommand(ctx: CommandContext) {
    const {
        command,
        owner,
        repo,
        pullNumber,
        installationId,
        authMode,
        commentId,
        isInline,
        filePath,
        line,
        diffHunk,
    } = ctx;

    if (!command) return;

    const token = await resolveToken(authMode, installationId);

    // 1. Add 👀 reaction to user comment (handles both issue comments and inline review comments)
    try {
        const reactionUrl = isInline
            ? `https://api.github.com/repos/${owner}/${repo}/pulls/comments/${commentId}/reactions`
            : `https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}/reactions`;

        const reactionRes = await fetch(reactionUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github.squirrel-girl-preview+json, application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ content: "eyes" }),
        });

        if (!reactionRes.ok) {
            const errBody = await reactionRes.text();
            console.warn(`Failed to add emoji reaction (${reactionRes.status}): ${errBody}`);
        } else {
            console.log(`Added 👀 reaction to ${isInline ? "inline" : "issue"} comment #${commentId}`);
        }
    } catch (err) {
        console.warn("Failed to add emoji reaction:", err);
    }

    // Helper to send response (posts inline thread reply or top-level PR comment)
    const sendResponse = async (message: string) => {
        if (isInline) {
            const replyUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/comments/${commentId}/replies`;
            const replyRes = await fetch(replyUrl, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ body: message }),
            });

            if (!replyRes.ok) {
                console.warn(`Failed to post inline reply (${replyRes.status}) — falling back to issue comment.`);
                await postPullRequestComment(owner, repo, pullNumber, message, authMode, installationId);
            }
        } else {
            await postPullRequestComment(owner, repo, pullNumber, message, authMode, installationId);
        }
    };

    // 2. Execute command action
    switch (command.type) {
        case "review": {
            const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            });

            if (!prRes.ok) {
                console.error(`Failed to fetch PR #${pullNumber}: ${prRes.statusText}`);
                return;
            }

            const prData = await prRes.json();
            const headSha = prData.head.sha;

            await reviewQueue.add(
                "review-pr",
                {
                    owner,
                    repo,
                    pullNumber,
                    headSha,
                    installationId,
                    authMode,
                },
                {
                    attempts: 3,
                    backoff: { type: "exponential", delay: 5000 },
                }
            );

            console.log(`[Command] Re-review enqueued for ${owner}/${repo} #${pullNumber}`);
            break;
        }

        case "help": {
            const helpMessage = `### Diffie Commands Reference

- **\`@diffie review\`** — Trigger an immediate AI code review on this PR.
- **\`@diffie explain <topic>\`** — Request an in-depth AI explanation for a code concept or inline code block.
- **\`@diffie help\`** — Show this command reference.`;

            await sendResponse(helpMessage);
            break;
        }

        case "explain": {
            let topic = command.targetText || "the review feedback and code quality best practices";

            // If inline comment, enrich prompt with file path, line number, and code diff hunk
            if (isInline && filePath) {
                topic = `Inline Code Context:\nFile: ${filePath}${line ? ` (Line ${line})` : ""}\nDiff Hunk:\n${diffHunk || "N/A"}\n\nUser Question/Topic: ${command.targetText || "Explain this code issue and how to fix it correctly."}`;
            }

            const dbSettings = await getRepoSettings(owner, repo);
            const geminiKey = dbSettings?.gemini_api_key || process.env.GEMINI_API_KEY;
            const groqKey = dbSettings?.groq_api_key || process.env.GROQ_API_KEY;

            if (!geminiKey && !groqKey) {
                await sendResponse(
                    "No API key configured for this repository. Please configure a Gemini or Groq key in the Diffie dashboard."
                );
                break;
            }

            const explanation = await explainConcept(topic, geminiKey, groqKey);
            const title = isInline && filePath ? `Inline Explanation (${filePath}:${line || ""})` : `Explanation: ${command.targetText || topic}`;
            const explanationMessage = `### ${title}\n\n${explanation}`;

            await sendResponse(explanationMessage);
            break;
        }

        case "unknown": {
            const unknownMsg = `Unknown command \`@diffie ${command.rawCommand}\`. Type \`@diffie help\` to see supported commands.`;
            await sendResponse(unknownMsg);
            break;
        }
    }
}