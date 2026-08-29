import { getInstallationToken, getPersonalAccessToken, type GitHubAuthMode } from "./appAuth";

interface ChangedFile {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
}

async function resolveToken(authMode: GitHubAuthMode, installationId?: number): Promise<string> {
    if (authMode === "token") {
        return getPersonalAccessToken();
    }

    if (!installationId) {
        throw new Error("installationId is required when authMode is 'app'.");
    }

    return getInstallationToken(installationId);
}

export async function fetchPullRequestFiles(
    owner: string,
    repo: string,
    pullNumber: number,
    authMode: GitHubAuthMode,
    installationId?: number,
): Promise<ChangedFile[]> {
    const token = await resolveToken(authMode, installationId);

    const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/files`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-Github-Api-Version": "2022-11-28"
        }
    });

    if (!response.ok) {
        throw new Error(
            `GitHub API error: ${response.status} ${response.statusText}`
        );
    }

    const files = (await response.json()) as ChangedFile[];
    return files;
}

export async function postPullRequestComment(
    owner: string,
    repo: string,
    pullNumber: number,
    body: string,
    authMode: GitHubAuthMode,
    installationId?: number,
): Promise<number> {
    const token = await resolveToken(authMode, installationId);

    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${pullNumber}/comments`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ body }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `Failed to post comment: ${response.status} ${response.statusText} — ${errorText}`
        );
    }

    const data = await response.json();
    return data.id;
}

export async function compareCommits(
    owner: string,
    repo: string,
    baseSha: string,
    headSha: string,
    authMode: GitHubAuthMode,
    installationId?: number,
): Promise<ChangedFile[] | null> {
    const token = await resolveToken(authMode, installationId);
    const url = `https://api.github.com/repos/${owner}/${repo}/compare/${baseSha}...${headSha}`;

    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
    });

    if (!response.ok) {
        console.warn(`Compare failed (${response.status}) — likely a force-push or rebase.`);
        return null;

    }

    const data = await response.json();
    return data.files ?? [];
}

export async function postReviewComments(
    owner: string,
    repo: string,
    pullNumber: number,
    commitSha: string,
    comments: { file: string, line: number, body: string }[],
    authMode: GitHubAuthMode,
    installationId?: number,
): Promise<{ posted: number; failed: { file: string; line: number }[]}> {
    const token = await resolveToken(authMode, installationId);
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            commit_id: commitSha,
            event: "COMMENT",
            comments: comments.map((c) => ({
                path: c.file,
                line: c.line,
                body: c.body
            })),
        }),
    });

    if (response.ok) {
        return { posted: comments.length, failed: [] };
    }

    console.warn("Batch review submission failed — retrying comments individually.");

    const failed: { file: string; line: number }[] = [];
    let posted = 0;

    for (const comment of comments) {
        const singleResponse = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                commit_id: commitSha,
                event: "COMMENT",
                comments: [{ path: comment.file, line: comment.line, body: comment.body }],
            }),
        });

        if (singleResponse.ok) {
            posted++;
        } else {
            failed.push({ file: comment.file, line: comment.line });
        }
    }

    return { posted, failed };
}