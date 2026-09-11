import React from "react";
import { Header } from "./Header";

interface LandingPageProps {
  onSignIn: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onSignIn }) => {
  return (
    <div>
      <Header user={null} />

      <main style={{ textAlign: "center", paddingTop: "4rem" }}>
        <div className="card" style={{ maxWidth: "520px", margin: "0 auto", padding: "3rem 2.2rem", textAlign: "left" }}>
          <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.4rem", fontWeight: 700, color: "var(--text)", marginTop: 0, marginBottom: "0.75rem", textTransform: "uppercase" }}>
            Automate Code Reviews
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.6, marginBottom: "2rem" }}>
            Diffie provides instant, automated inline PR reviews powered by Google Gemini, Groq, and OpenAI. Sign in with GitHub to configure repository API keys and monitor reviews.
          </p>

          <div style={{ marginBottom: "2rem", borderTop: "1px solid var(--panel-border)", paddingTop: "1.2rem" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.82rem", color: "var(--text)", marginBottom: "0.6rem" }}>
              • Incremental commit diff reviews
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.82rem", color: "var(--text)", marginBottom: "0.6rem" }}>
              • Inline comments & issue classification
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: "0.82rem", color: "var(--text)" }}>
              • Bring Your Own API Key (Gemini / Groq / OpenAI)
            </div>
          </div>

          <button
            onClick={onSignIn}
            className="btn"
            style={{
              width: "100%",
              padding: "0.85rem",
              fontSize: "0.95rem",
              fontFamily: "var(--mono)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textTransform: "uppercase",
              letterSpacing: "0.03em"
            }}
          >
            Sign in with GitHub
          </button>
        </div>
      </main>
    </div>
  );
};
