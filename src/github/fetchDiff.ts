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

    if(!response.ok) {
        throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`
    );
    }

    const files = (await response.json()) as ChangedFile[];
    return files;
}