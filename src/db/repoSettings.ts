import { pool } from "./pool";

export interface RepoSettingsRow {
    id?: string;
    owner: string;
    repo: string;
    installationId: string;
    gemini_api_key?: string;
    groq_api_key?: string;
    minSeverity: "bug" | "style" | "suggestion";
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

export async function getRepoSettings(owner: string, repo:string): Promise<RepoSettingsRow | null> {
    await initRepoSettingsTable();
    const result = await pool.query(`
        SELECT * FROM repo_settings WHERE owner = $1 AND repo = $2        
    `, [owner, repo])

    if(result.rows.length == 0) return null;

    const row = result.rows[0];
    return {
        ...row,
        ignore_files: Array.isArray(row.ignore_files)
            ? row.ignore_files
            : JSON.parse(row.ignore_files || "[]"),
    }
}

