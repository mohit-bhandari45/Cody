import React, { useState, useEffect } from "react";

export interface RepoSettings {
  owner: string;
  repo: string;
  min_severity: "bug" | "style" | "suggestion";
  inline_comments: boolean;
  max_diff_characters: number;
  ignore_files: string[];
  gemini_api_key?: string;
  groq_api_key?: string;
  has_gemini_key?: boolean;
  has_groq_key?: boolean;
}

interface BYOKFormProps {
  settings: RepoSettings | null;
  onSave: (payload: any) => Promise<void>;
}

export const BYOKForm: React.FC<BYOKFormProps> = ({ settings, onSave }) => {
  const [geminiKey, setGeminiKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [minSeverity, setMinSeverity] = useState<"bug" | "style" | "suggestion">("suggestion");
  const [inlineComments, setInlineComments] = useState(true);
  const [maxDiffChars, setMaxDiffChars] = useState(12000);
  const [ignoreFilesStr, setIgnoreFilesStr] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (settings) {
      setMinSeverity(settings.min_severity || "suggestion");
      setInlineComments(settings.inline_comments ?? true);
      setMaxDiffChars(settings.max_diff_characters || 12000);
      setIgnoreFilesStr((settings.ignore_files || []).join(", "));
      setGeminiKey("");
      setGroqKey("");
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings?.owner || !settings?.repo) {
      alert("Please select a repository first.");
      return;
    }

    if (!geminiKey && !groqKey && !settings.has_gemini_key && !settings.has_groq_key) {
      alert("At least one API key (Gemini or Groq) is required.");
      return;
    }

    setIsSubmitting(true);
    const ignoreFiles = ignoreFilesStr
      ? ignoreFilesStr.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const payload: any = {
      owner: settings.owner,
      repo: settings.repo,
      min_severity: minSeverity,
      inline_comments: inlineComments,
      max_diff_characters: maxDiffChars,
      ignore_files: ignoreFiles,
    };

    if (geminiKey) payload.gemini_api_key = geminiKey;
    if (groqKey) payload.groq_api_key = groqKey;

    await onSave(payload);
    setIsSubmitting(false);
  };

  if (!settings) {
    return (
      <div className="card">
        <p style={{ color: "var(--text-muted)", fontFamily: "var(--mono)", fontSize: "0.85rem", margin: 0 }}>
          Select a repository above to configure API keys and review rules.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="card">
        <h3>
          API Keys (Bring Your Own Key) <span className="badge-req">Required</span>
        </h3>
        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "1.2rem", lineHeight: 1.5 }}>
          Provide at least one API key (Gemini or Groq) for processing PR code reviews on your repository.
        </p>

        <div className="form-group">
          <label>Google Gemini API Key:</label>
          <input
            type="password"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder={settings.has_gemini_key ? settings.gemini_api_key : "AIzaSy..."}
          />
          <div className="key-status">
            Status: {settings.has_gemini_key ? `Configured (${settings.gemini_api_key})` : "Not Configured"}
          </div>
        </div>

        <div className="form-group">
          <label>Groq API Key (Llama 3):</label>
          <input
            type="password"
            value={groqKey}
            onChange={(e) => setGroqKey(e.target.value)}
            placeholder={settings.has_groq_key ? settings.groq_api_key : "gsk_..."}
          />
          <div className="key-status">
            Status: {settings.has_groq_key ? `Configured (${settings.groq_api_key})` : "Not Configured"}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Review Configuration Rules</h3>

        <div className="form-group">
          <label>Minimum Severity Threshold:</label>
          <select
            value={minSeverity}
            onChange={(e) => setMinSeverity(e.target.value as any)}
          >
            <option value="suggestion">Suggestion (Report all issues)</option>
            <option value="style">Style & Bugs</option>
            <option value="bug">Bugs Only (Strict filtering)</option>
          </select>
        </div>

        <div className="form-group">
          <label>Inline Line Comments:</label>
          <select
            value={inlineComments ? "true" : "false"}
            onChange={(e) => setInlineComments(e.target.value === "true")}
          >
            <option value="true">Enabled (Post comments directly on diff lines)</option>
            <option value="false">Disabled (Post summary comment only)</option>
          </select>
        </div>

        <div className="form-group">
          <label>Max Diff Characters Limit:</label>
          <input
            type="number"
            value={maxDiffChars}
            onChange={(e) => setMaxDiffChars(parseInt(e.target.value) || 12000)}
          />
        </div>

        <div className="form-group">
          <label>Ignored Files (comma separated patterns):</label>
          <input
            type="text"
            value={ignoreFilesStr}
            onChange={(e) => setIgnoreFilesStr(e.target.value)}
            placeholder="*.test.ts, docs/*, legacy/"
          />
        </div>
      </div>

      <button type="submit" className="btn" disabled={isSubmitting} style={{ width: "100%", padding: "0.85rem" }}>
        {isSubmitting ? "Saving..." : "Save Settings & API Keys"}
      </button>
    </form>
  );
};
