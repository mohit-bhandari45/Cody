import { useState, useEffect } from "react";
import { RepoSelector } from "./components/RepoSelector";
import { BYOKForm, RepoSettings } from "./components/BYOKForm";
import { ReviewHistory, ReviewRun } from "./components/ReviewHistory";

export function App() {
  const [activeTab, setActiveTab] = useState<"settings" | "history">("settings");
  const [currentRepo, setCurrentRepo] = useState<{ owner: string; repo: string } | null>(null);
  const [settings, setSettings] = useState<RepoSettings | null>(null);
  const [reviews, setReviews] = useState<ReviewRun[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Restore saved repo from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("pr_bot_last_repo");
    if (saved && saved.includes("/")) {
      const [owner, repo] = saved.split("/");
      handleLoadRepo(owner.trim(), repo.trim());
    }
  }, []);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleLoadRepo = async (owner: string, repo: string) => {
    setCurrentRepo({ owner, repo });
    localStorage.setItem("pr_bot_last_repo", `${owner}/${repo}`);

    try {
      const res = await fetch(`/api/repo/settings?owner=${owner}&repo=${repo}`);
      if (!res.ok) throw new Error("Failed to fetch settings");
      const data = await res.json();
      setSettings(data);
      showToast(`Loaded settings for ${owner}/${repo}`, "success");
      fetchHistory(owner, repo);
    } catch (err: any) {
      showToast("Error loading repo: " + err.message, "error");
    }
  };

  const fetchHistory = async (owner: string, repo: string) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/repo/reviews?owner=${owner}&repo=${repo}`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews || []);
      }
    } catch (err) {
      console.error("Failed to load review history", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSaveSettings = async (payload: any) => {
    try {
      const res = await fetch("/api/repo/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok) {
        showToast("Settings & API keys saved successfully!", "success");
        if (currentRepo) {
          handleLoadRepo(currentRepo.owner, currentRepo.repo);
        }
      } else {
        showToast("Error: " + (data.error || "Failed to save settings"), "error");
      }
    } catch (err: any) {
      showToast("Failed to save settings: " + err.message, "error");
    }
  };

  const initialRepoString = currentRepo ? `${currentRepo.owner}/${currentRepo.repo}` : "";

  return (
    <div>
      <header className="header">
        <div class="brand">
          <h1>pr-bot <span>// repo owner dashboard</span></h1>
        </div>
      </header>

      <main>
        <RepoSelector onLoadRepo={handleLoadRepo} initialRepo={initialRepoString} />

        {toast && (
          <div className={`toast ${toast.type}`}>
            {toast.message}
          </div>
        )}

        <div className="tabs">
          <button
            className={`tab-btn ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            ⚙️ Settings & Mandatory BYOK
          </button>
          <button
            className={`tab-btn ${activeTab === "history" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("history");
              if (currentRepo) fetchHistory(currentRepo.owner, currentRepo.repo);
            }}
          >
            📜 Review History Logs
          </button>
        </div>

        {activeTab === "settings" ? (
          <BYOKForm settings={settings} onSave={handleSaveSettings} />
        ) : (
          <ReviewHistory reviews={reviews} isLoading={isLoadingHistory} />
        )}
      </main>
    </div>
  );
}
