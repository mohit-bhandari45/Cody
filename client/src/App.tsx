import { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { LandingPage } from "./components/LandingPage";
import { RepoSelector, RepoItem } from "./components/RepoSelector";
import { BYOKForm, RepoSettings } from "./components/BYOKForm";
import { ReviewHistory, ReviewRun } from "./components/ReviewHistory";
import { Toast } from "./components/Toast";
import { API_BASE_URL } from "./config";

interface UserProfile {
  login: string;
  name: string;
  avatar_url: string;
  html_url: string;
}

export function App() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userRepos, setUserRepos] = useState<RepoItem[]>([]);
  const [activeTab, setActiveTab] = useState<"settings" | "history">("settings");
  const [selectedRepoFull, setSelectedRepoFull] = useState<string>("");
  const [settings, setSettings] = useState<RepoSettings | null>(null);
  const [reviews, setReviews] = useState<ReviewRun[]>([]);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get("token");
    const authError = urlParams.get("auth_error");
    const reason = urlParams.get("reason");

    if (authError) {
      showToast(`Authentication failed: ${reason || authError}`, "error");
      window.history.replaceState({}, document.title, window.location.pathname);
      setIsLoadingAuth(false);
      return;
    }

    if (tokenFromUrl) {
      localStorage.setItem("github_oauth_token", tokenFromUrl);
      setAuthToken(tokenFromUrl);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      const savedToken = localStorage.getItem("github_oauth_token");
      if (savedToken) setAuthToken(savedToken);
      else setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    if (!authToken) return;

    fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Authentication expired");
        return res.json();
      })
      .then((data) => {
        setUser(data.user);
        setUserRepos(data.repos || []);

        const lastSelected = localStorage.getItem("diffie_selected_repo") || localStorage.getItem("cody_selected_repo");
        if (lastSelected && data.repos.some((r: RepoItem) => r.full_name === lastSelected)) {
          const [owner, repo] = lastSelected.split("/");
          handleSelectRepo(owner, repo);
        } else if (data.repos.length > 0) {
          const first = data.repos[0];
          handleSelectRepo(first.owner, first.name);
        }
      })
      .catch((err) => {
        console.error("Auth failed:", err);
        handleSignOut();
      })
      .finally(() => setIsLoadingAuth(false));
  }, [authToken]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSignIn = () => {
    window.location.href = `${API_BASE_URL}/api/auth/github`;
  };

  const handleSignOut = () => {
    localStorage.removeItem("github_oauth_token");
    setAuthToken(null);
    setUser(null);
    setUserRepos([]);
    setSettings(null);
    setSelectedRepoFull("");
  };

  const handleSelectRepo = async (owner: string, repo: string) => {
    const fullName = `${owner}/${repo}`;
    setSelectedRepoFull(fullName);
    localStorage.setItem("diffie_selected_repo", fullName);

    try {
      const res = await fetch(`${API_BASE_URL}/api/repo/settings?owner=${owner}&repo=${repo}`);
      if (!res.ok) throw new Error("Failed to fetch repo settings");
      const data = await res.json();
      setSettings(data);
      fetchHistory(owner, repo);
    } catch (err: any) {
      showToast("Error loading repo settings: " + err.message, "error");
    }
  };

  const fetchHistory = async (owner: string, repo: string) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/repo/reviews?owner=${owner}&repo=${repo}`);
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
      const res = await fetch(`${API_BASE_URL}/api/repo/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok) {
        showToast("Settings & API keys saved successfully!", "success");
        if (selectedRepoFull.includes("/")) {
          const [owner, repo] = selectedRepoFull.split("/");
          handleSelectRepo(owner, repo);
        }
      } else {
        showToast("Error: " + (data.error || "Failed to save settings"), "error");
      }
    } catch (err: any) {
      showToast("Failed to save settings: " + err.message, "error");
    }
  };

  if (isLoadingAuth) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", fontFamily: "var(--mono)", color: "var(--text-muted)", fontSize: "0.9rem" }}>
        Authenticating with GitHub...
      </div>
    );
  }

  if (!user) {
    return <LandingPage onSignIn={handleSignIn} />;
  }

  return (
    <div>
      <Header user={user} onSignOut={handleSignOut} />

      <main>
        <RepoSelector
          repos={userRepos}
          selectedRepo={selectedRepoFull}
          onSelectRepo={handleSelectRepo}
        />

        <Toast toast={toast} />

        <div className="tabs">
          <button
            className={`tab-btn ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            Settings & API Keys
          </button>
          <button
            className={`tab-btn ${activeTab === "history" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("history");
              if (selectedRepoFull.includes("/")) {
                const [owner, repo] = selectedRepoFull.split("/");
                fetchHistory(owner, repo);
              }
            }}
          >
            Review History Logs
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
