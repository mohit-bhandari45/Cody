import { useState, useEffect } from "react";
import { RepoSelector, RepoItem } from "./components/RepoSelector";
import { BYOKForm, RepoSettings } from "./components/BYOKForm";
import { ReviewHistory, ReviewRun } from "./components/ReviewHistory";

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

    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Authentication expired");
        return res.json();
      })
      .then((data) => {
        setUser(data.user);
        setUserRepos(data.repos || []);

        const lastSelected = localStorage.getItem("cody_selected_repo");
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
    window.location.href = "http://localhost:3000/api/auth/github";
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
    localStorage.setItem("cody_selected_repo", fullName);

    try {
      const res = await fetch(`/api/repo/settings?owner=${owner}&repo=${repo}`);
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
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", fontFamily: "var(--mono)", color: "var(--dim)" }}>
        Authenticating with GitHub...
      </div>
    );
  }

  // --- LANDING PAGE: SIGN IN WITH GITHUB ---
  if (!user) {
    return (
      <div>
        <header className="header">
          <div className="brand">
            <div className="logo-icon">🤖</div>
            <h1>Cody</h1>
            <span className="tag">AI Code Reviewer</span>
          </div>
        </header>

        <main style={{ textAlign: "center", paddingTop: "4rem" }}>
          <div className="card" style={{ maxWidth: "500px", margin: "0 auto", padding: "3rem 2.2rem" }}>
            <div style={{ fontSize: "2.8rem", marginBottom: "1rem" }}>🤖</div>
            <h2 style={{ fontFamily: "var(--sans)", fontSize: "1.6rem", fontWeight: 700, color: "#f8fafc", marginTop: 0, marginBottom: "0.5rem" }}>
              Automate Code Reviews with Cody
            </h2>
            <p style={{ color: "var(--dim)", fontSize: "0.92rem", lineHeight: 1.6, marginBottom: "2.2rem" }}>
              Instant automated inline PR reviews powered by Google Gemini 3.6 & Groq Llama 3. Sign in to configure your repositories.
            </p>

            <button
              onClick={handleSignIn}
              className="btn"
              style={{
                width: "100%",
                padding: "0.9rem",
                fontSize: "1rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.7rem",
              }}
            >
              <svg height="20" width="20" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
              </svg>
              Sign in with GitHub
            </button>
          </div>
        </main>
      </div>
    );
  }

  // --- AUTHENTICATED CODY DASHBOARD ---
  return (
    <div>
      <header className="header">
        <div className="brand">
          <div className="logo-icon">🤖</div>
          <h1>Cody</h1>
          <span className="tag">AI Code Reviewer</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1.2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <img src={user.avatar_url} alt={user.login} style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid var(--panel-border)" }} />
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.88rem", color: "#f8fafc", fontWeight: 500 }}>@{user.login}</span>
          </div>
          <button
            onClick={handleSignOut}
            style={{
              background: "none",
              border: "1px solid var(--panel-border)",
              color: "var(--dim)",
              fontFamily: "var(--mono)",
              fontSize: "0.78rem",
              padding: "0.4rem 0.8rem",
              borderRadius: "6px",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      <main>
        <RepoSelector
          repos={userRepos}
          selectedRepo={selectedRepoFull}
          onSelectRepo={handleSelectRepo}
        />

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
              if (selectedRepoFull.includes("/")) {
                const [owner, repo] = selectedRepoFull.split("/");
                fetchHistory(owner, repo);
              }
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
