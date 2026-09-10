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
      <label htmlFor="repo-select">Select Repository:</label>
      <select
        id="repo-select"
        value={selectedRepo}
        onChange={handleChange}
        style={{
          flex: 1,
          background: "var(--bg)",
          border: "1px solid var(--line)",
          color: "#e6edf3",
          padding: "0.65rem 1rem",
          borderRadius: "6px",
          fontFamily: "var(--mono)",
          fontSize: "0.9rem",
          outline: "none",
        }}
      >
        <option value="">-- Choose a repository --</option>
        {repos.map((r) => (
          <option key={r.id} value={r.full_name}>
            {r.full_name} {r.private ? "🔒 (Private)" : "🌐 (Public)"}
          </option>
        ))}
      </select>
    </div>
  );
};
