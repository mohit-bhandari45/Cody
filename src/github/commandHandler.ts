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
}

export async function handleSlashCommand(ctx: CommandContext) {
    const { command, owner, repo, pullNumber, installationId, authMode, commentId } = ctx;
    if (!command) return;

    const token = await resolveToken(authMode, installationId);

    // 1. React with 👀 emoji on the user's comment to acknowledge receipt
    try {
        const reactionRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}/reactions`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github.squirrel-girl-preview+json, application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ content: "eyes" }),
            }
        );

        if (!reactionRes.ok) {
            const errBody = await reactionRes.text();
            console.warn(`Failed to add emoji reaction (${reactionRes.status}): ${errBody}`);
        } else {
            console.log(`Added 👀 reaction to comment #${commentId}`);
        }
    } catch (err) {
        console.warn("Failed to add emoji reaction:", err);
    }

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
- **\`@diffie explain <topic>\`** — Request an in-depth AI explanation for a code concept or bug.
- **\`@diffie help\`** — Show this command reference.`;

            await postPullRequestComment(owner, repo, pullNumber, helpMessage, authMode, installationId);
            break;
        }

        case "explain": {
            const topic = command.targetText || "the review feedback and code quality best practices";

            const dbSettings = await getRepoSettings(owner, repo);
            const geminiKey = dbSettings?.gemini_api_key || process.env.GEMINI_API_KEY;
            const groqKey = dbSettings?.groq_api_key || process.env.GROQ_API_KEY;

            if (!geminiKey && !groqKey) {
                await postPullRequestComment(
                    owner,
                    repo,
                    pullNumber,
                    "No API key configured for this repository. Please configure a Gemini or Groq key in the Diffie dashboard.",
                    authMode,
                    installationId
                );
                break;
            }

            const explanation = await explainConcept(topic, geminiKey, groqKey);
            const explanationMessage = `### Explanation: ${topic}\n\n${explanation}`;
            await postPullRequestComment(owner, repo, pullNumber, explanationMessage, authMode, installationId);
            break;
        }

        case "unknown": {
            const unknownMsg = `Unknown command \`@diffie ${command.rawCommand}\`. Type \`@diffie help\` to see supported commands.`;
            await postPullRequestComment(owner, repo, pullNumber, unknownMsg, authMode, installationId);
            break;
        }
    }
}