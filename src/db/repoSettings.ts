import { pool } from "./pool";

export interface RepoSettingsRow {
    id?: string;
    owner: string;
    repo: string;
    installation_id: string;
    gemini_api_key?: string;
    groq_api_key?: string;
    min_severity: "bug" | "style" | "suggestion";
    inline_comments: boolean;
    max_diff_characters: number;
    ignore_files: string[]
}

export async function initRepoSettingsTable(): Promise<void> {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS repo_settings (
            id SERIAL PRIMARY KEY,
            owner TEXT NOT NULL,
            repo TEXT NOT NULL,
            installation_id INT,
            gemini_api_key TEXT,
            groq_api_key TEXT,
            min_severity TEXT DEFAULT 'suggestion',
            inline_comments BOOLEAN DEFAULT true,
            max_diff_characters INT DEFAULT 12000,
            ignore_files JSONB DEFAULT '[]',
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE (owner, repo)
        );    
    `)
}

export async function getRepoSettings(owner: string, repo: string): Promise<RepoSettingsRow | null> {
    await initRepoSettingsTable();
    const result = await pool.query(`
        SELECT * FROM repo_settings WHERE owner = $1 AND repo = $2        
    `, [owner, repo])

    if (result.rows.length == 0) return null;

    const row = result.rows[0];
    return {
        ...row,
        ignore_files: Array.isArray(row.ignore_files)
            ? row.ignore_files
            : JSON.parse(row.ignore_files || "[]"),
    }
}

export async function saveRepoSettings(settings: RepoSettingsRow): Promise<RepoSettingsRow> {
    await initRepoSettingsTable();
    const result = await pool.query(`
        INSERT INTO repo_settings (
            owner, repo, installation_id, gemini_api_key, groq_api_key, 
            min_severity, inline_comments, max_diff_characters, ignore_files, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
        ON CONFLICT (owner, repo) DO UPDATE SET
            gemini_api_key = COALESCE(EXCLUDED.gemini_api_key, repo_settings.gemini_api_key),
            groq_api_key = COALESCE(EXCLUDED.groq_api_key, repo_settings.groq_api_key),
            min_severity = EXCLUDED.min_severity,
            inline_comments = EXCLUDED.inline_comments,
            max_diff_characters = EXCLUDED.max_diff_characters,
            ignore_files = EXCLUDED.ignore_files,
            updated_at = now()
        RETURNING *
    `, [
        settings.owner,
        settings.repo,
        settings.installation_id || null,
        settings.gemini_api_key || null,
        settings.groq_api_key || null,
        settings.min_severity || "suggestion",
        settings.inline_comments ?? true,
        settings.max_diff_characters || 12000,
        JSON.stringify(settings.ignore_files || []),
    ]);

    return result.rows[0];
}