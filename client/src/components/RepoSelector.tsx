import React from "react";

export interface RepoItem {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  private: boolean;
}

interface RepoSelectorProps {
  repos: RepoItem[];
  selectedRepo: string;
  onSelectRepo: (owner: string, repo: string) => void;
}

export const RepoSelector: React.FC<RepoSelectorProps> = ({ repos, selectedRepo, onSelectRepo }) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (!val) return;
    const [owner, repo] = val.split("/");
    onSelectRepo(owner, repo);
  };

  return (
    <div className="repo-selector">
      <label htmlFor="repo-select">Repository:</label>
      <select
        id="repo-select"
        value={selectedRepo}
        onChange={handleChange}
      >
        <option value="">-- Choose a repository --</option>
        {repos.map((r) => (
          <option key={r.id} value={r.full_name}>
            {r.full_name} {r.private ? "[Private]" : "[Public]"}
          </option>
        ))}
      </select>
      <a
        href="https://github.com/apps/mohit-pr-review-bot/installations/new"
        target="_blank"
        rel="noopener noreferrer"
        className="btn-secondary"
      >
        Install Bot +
      </a>
    </div>
  );
};
