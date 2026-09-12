import { reviewQueue } from "../queue/reviewQueue";
import { getInstallationToken, getPersonalAccessToken } from "./appAuth";
import { DiffieCommand } from "./commandParser";

export interface CommandContext {
    command: DiffieCommand;
    owner: string;
    repo: string;
    pullNumber: number;
    commentId: number;
    commentBody: string;
    userLogin: string;
    installationId: number;
    authMode: "app" | "token";
}

async function getOctokitClient(authMode: "app" | "token", installationId: number): Promise<Octokit> {
    const token =
        authMode === "token"
            ? getPersonalAccessToken()
            : await getInstallationToken(installationId);
    return new Octokit({ auth: token });
}

export async function handleSlashCommand(ctx: CommandContext) {
    const { command, owner, repo, pullNumber, installationId, authMode, commentId } = ctx;
    if (!command) return;

    const octokit = await getOctokitClient(authMode, installationId);

    //  reacting with eyes emojis
    try {
        await octokit.rest.reactions.creteForIssue({
            owner, repo, commentId: commentId, content: "eyes",
        })
    } catch (error) {
        console.warn("Failed to add emoji reaction:", error);
    }

    switch (command.type) {
        case "review":
            const prRes = await octokit.rest.pulls.get({
                owner, repo, pull_number: pullNumber
            })
            const headSha = prRes.data.head.sha;

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

        case "help": {
            const helpMessage = `### 🤖 Diffie Commands Reference
- **\`@diffie review\`** — Trigger an immediate AI code review on this PR.
- **\`@diffie help\`** — Show this menu.`;
            await octokit.rest.issues.createComment({
                owner,
                repo,
                issue_number: pullNumber,
                body: helpMessage,
            });
            break;
        }
        
        case "unknown": {
            await octokit.rest.issues.createComment({
                owner,
                repo,
                issue_number: pullNumber,
                body: `Unknown command \`@diffie ${command.rawCommand}\`. Type \`@diffie help\` to see supported commands.`,
            });
            break;
        }
    }
}