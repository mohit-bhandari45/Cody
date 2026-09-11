import React from "react";
import { ThemeToggle } from "./ThemeToggle";

interface HeaderProps {
  user: { login: string; avatar_url: string; html_url: string } | null;
  onSignOut?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onSignOut }) => {
  return (
    <header className="header">
      <div className="brand">
        <h1>Diffie</h1>
        <span className="tag">AI PR Reviewer</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <ThemeToggle />
        {user && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <img
                src={user.avatar_url}
                alt={user.login}
                style={{ width: 26, height: 26, borderRadius: "50%", border: "1px solid var(--panel-border)" }}
              />
              <span style={{ fontFamily: "var(--mono)", fontSize: "0.85rem", color: "var(--text)", fontWeight: 500 }}>
                @{user.login}
              </span>
            </div>
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="theme-toggle-btn"
              >
                Sign Out
              </button>
            )}
          </>
        )}
      </div>
    </header>
  );
};
