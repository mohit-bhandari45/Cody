interface ChangedFile {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
}

export async function fetchPullRequestFiles(
    owner: string,
    repo: string,
    pullNumber: number,
): Promise<ChangedFile[]> {
    const token = process.env.GITHUB_TOKEN;

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
    body: string
): Promise<void> {
    const token = process.env.GITHUB_TOKEN;

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
}