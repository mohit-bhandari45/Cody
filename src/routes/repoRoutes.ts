import { Router, Request, Response } from "express";
import { getRepoSettings, saveRepoSettings } from "../db/repoSettings";
import { pool } from "../db/pool";

export const repoRouter = Router();

repoRouter.get("/settings", async (req: Request, res: Response) => {
    const owner = req.query.owner as string;
    const repo = req.query.repo as string;

    if (!owner || !repo) {
        return res.status(400).json({ error: "Missing owner or repo query parameter" });
    }

    try {
        const settings = await getRepoSettings(owner, repo);
        if (!settings) {
            return res.json({
                owner, repo,
                min_severity: "suggestion",
                inline_comments: true,
                max_diff_characters: 12000,
                ignore_files: [],
                has_gemini_key: false,
                has_groq_key: false,
            });
        }

        return res.json({
            ...settings,
            gemini_api_key: settings.gemini_api_key ? "••••••••" + settings.gemini_api_key.slice(-4) : "",
            groq_api_key: settings.groq_api_key ? "••••••••" + settings.groq_api_key.slice(-4) : "",
            has_gemini_key: !!settings.gemini_api_key,
            has_groq_key: !!settings.groq_api_key,
        });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

repoRouter.post("/settings", async (req: Request, res: Response) => {
    const { owner, repo, gemini_api_key, groq_api_key } = req.body;
    if (!owner || !repo) {
        return res.status(400).json({ error: "owner and repo are required" });
    }
    if (!gemini_api_key && !groq_api_key) {
        return res.status(400).json({ error: "At least one API key (Gemini or Groq) is required." });
    }
    try {
        const saved = await saveRepoSettings(req.body);
        return res.json({ message: "Settings saved successfully", settings: saved });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

repoRouter.get("/reviews", async (req: Request, res: Response) => {
    const { owner, repo } = req.query;

    if (!owner || !repo) {
        return res.status(400).json({ error: "Missing owner or repo query parameter" });
    }

    try {
        const result = await pool.query(
            `SELECT rr.*, pr.pr_number 
             FROM review_runs rr
             JOIN pr_reviews pr ON rr.pr_review_id = pr.id
             WHERE pr.owner = $1 AND pr.repo = $2
             ORDER BY rr.created_at DESC LIMIT 50`,
            [owner, repo]
        );

        return res.json({ reviews: result.rows });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});
