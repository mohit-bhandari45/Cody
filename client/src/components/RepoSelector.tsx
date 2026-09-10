import React, { useState } from "react";

interface RepoSelectorProps {
  onLoadRepo: (owner: string, repo: string) => void;
  initialRepo?: string;
}

export const RepoSelector: React.FC<RepoSelectorProps> = ({ onLoadRepo, initialRepo = "" }) => {
  const [repoInput, setRepoInput] = useState(initialRepo);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = repoInput.trim();
    if (!val.includes("/")) {
      alert("Please enter repository in format 'owner/repo' (e.g. mohit-bhandari45/Cody)");
      return;
    }
    const [owner, repo] = val.split("/");
    onLoadRepo(owner.trim(), repo.trim());
  };

  return (
    <form className="repo-selector" onSubmit={handleSubmit}>
      <label htmlFor="repo-input">Repository:</label>
      <input
        id="repo-input"
        type="text"
        value={repoInput}
        onChange={(e) => setRepoInput(e.target.value)}
        placeholder="owner/repository (e.g. mohit-bhandari45/Cody)"
      />
      <button type="submit" className="btn">Load Repository</button>
    </form>
  );
};
