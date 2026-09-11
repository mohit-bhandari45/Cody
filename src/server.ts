import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import { createServer } from "http";
import Redis from "ioredis";
import { Server } from "socket.io";
import { pool } from "./db/pool";
import { updatePrStatus } from "./db/prReviews";
import { getRepoSettings, saveRepoSettings } from "./db/repoSettings";
import { resolveInstallationId } from "./helpers/helper";
import { reviewQueue } from "./queue/reviewQueue";
import { verifyGithubSignature } from "./verifySignature";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*" }
})
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const isProduction = process.env.NODE_ENV === "production" || process.env.RENDER === "true";
const authMode: "app" | "token" = isProduction ? "app" : "token";

if (!WEBHOOK_SECRET) {
    console.error("Missing GITHUB_WEBHOOK_SECRET in .env");
    process.exit(1);
}

app.use((_req: Request, res: Response, next: NextFunction) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (_req.method === "OPTIONS") return res.sendStatus(200);
    next();
});

app.use(
    express.json({
        verify: (req: Request, _res: Response, buf: Buffer) => {
            (req as any).rawBody = buf;
        },
    })
);

app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
});

const clientUrl = isProduction
    ? (process.env.PROD_CLIENT_URL || "https://cody-delta-ten.vercel.app")
    : (process.env.DEV_CLIENT_URL || "http://localhost:5173");

const serverUrl = isProduction
    ? (process.env.PROD_SERVER_URL || "https://cody-1.onrender.com")
    : (process.env.DEV_SERVER_URL || `http://localhost:${PORT}`);

// --- GITHUB OAUTH ROUTES ---
app.get("/api/auth/github", (_req: Request, res: Response) => {
    const clientId = process.env.GITHUB_CLIENT_ID || "Iv23liCBquYLO35ElLLF";
    const redirectUri = encodeURIComponent(`${serverUrl}/api/auth/github/callback`);
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=read:user,repo`;
    return res.redirect(githubAuthUrl);
});

app.get("/api/auth/github/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string;
    if (!code) {
        return res.status(400).send("No OAuth code provided.");
    }

    try {
        const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                client_id: process.env.GITHUB_CLIENT_ID || "Iv23liCBquYLO35ElLLF",
                client_secret: process.env.GITHUB_CLIENT_SECRET || "",
                code,
            }),
        });

        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;

        if (!accessToken) {
            console.error("OAuth token exchange failed:", tokenData);
            return res.redirect(`${clientUrl}/?auth_error=failed_token&reason=${encodeURIComponent(tokenData.error_description || tokenData.error || "unknown")}`);
        }

        return res.redirect(`${clientUrl}/?token=${accessToken}`);
    } catch (err: any) {
        console.error("OAuth error:", err);
        return res.redirect(`${clientUrl}/?auth_error=server_error`);
    }
});

app.get("/api/auth/me", async (req: Request, res: Response) => {
    const authHeader = req.header("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
        return res.status(401).json({ error: "Unauthorized — missing token" });
    }

    try {
        const userRes = await fetch("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
        });
        if (!userRes.ok) return res.status(401).json({ error: "Invalid token" });
        const user = await userRes.json();

        const reposRes = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
        });
        const repos = reposRes.ok ? await reposRes.json() : [];

        const formattedRepos = repos.map((r: any) => ({
            id: r.id,
            name: r.name,
            full_name: r.full_name,
            owner: r.owner.login,
            private: r.private,
            html_url: r.html_url
        }));

        return res.json({
            user: {
                login: user.login,
                name: user.name,
                avatar_url: user.avatar_url,
                html_url: user.html_url,
            },
            repos: formattedRepos
        });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});


// get method to get settings for a Repo
app.get("/api/repo/settings", async (req: Request, res: Response) => {
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
            })
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
})

// post method to add settings
app.post("/api/repo/settings", async (req: Request, res: Response) => {
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

app.get("/api/repo/reviews", async (req: Request, res: Response) => {
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
             ORDER BY rr.created_at DESC LIMIT 50`
            , [owner, repo])
            
        return res.json({ reviews: result.rows[0] });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

app.post("/webhook", async (req: Request, res: Response) => {
    const signature = req.header("x-hub-signature-256");
    const event = req.header("x-github-event");
    const rawBody = (req as any).rawBody as Buffer;

    const isValid = verifyGithubSignature(rawBody, signature, WEBHOOK_SECRET);
    if (!isValid) {
        console.warn("Rejected webhook: invalid or missing signature");
        return res.status(401).json({ error: "Invalid signature" });
    }

    res.status(200).json({ received: true });

    if (event != "pull_request") {
        console.log(`Ignore event: ${event}`);
        return;
    }

    const action = req.body.action;
    const pr = req.body.pull_request;
    const repo = req.body.repository;

    if (action === "closed") {
        const newStatus = pr.merged ? "merged" : "closed";
        await updatePrStatus(repo.owner.login, repo.name, pr.number, newStatus);
        console.log(`PR #${pr.number} marked as ${newStatus}`);
        return;
    }

    if (action === "reopened") {
        await updatePrStatus(repo.owner.login, repo.name, pr.number, "open");
        console.log(`PR #${pr.number} reopened`);
        return;
    }

    if (action != "opened" && action != "synchronize") {
        console.log(`Ignore pull_request action: ${action}`);
        return;
    }

    console.log(`[pull_request:${action}] ${repo.full_name} #${pr.number} — "${pr.title}"`);

    const installationId = resolveInstallationId(req.body);
    const mode = isProduction ? "production" : "local";

    console.log("Webhook event:", {
        event,
        action,
        repo: repo?.full_name,
        pullNumber: pr?.number,
        installationId,
        authMode: authMode,
        mode,
        hasInstallation: !!req.body.installation,
        sender: req.body.sender?.login,
    });

    if (isProduction && !installationId) {
        console.warn("Skipping production review job: no installation.id found on GitHub App webhook payload.");
        return;
    }

    try {
        await reviewQueue.add("review-pr", {
            owner: repo.owner.login,
            repo: repo.name,
            pullNumber: pr.number,
            headSha: pr.head.sha,
            installationId,
            authMode,
        }, {
            // retry
            attempts: 3,
            backoff: {
                // delay * 2^(attemptsMade - 1) -> formula for exponential
                // delay = 5 -> 5s, 10s, 20s, 40s
                type: "exponential",
                delay: 5000
            }
        });

        console.log(`Enqueued review job for #${pr.number}`);
    } catch (err) {
        console.error("Failed to enqueue review job:", err);
    }
})

const subscriber = new Redis(process.env.REDIS_URL!);
subscriber.subscribe("job-updates");

subscriber.on("message", (channel, message) => {
    if (channel === "job-updates") {
        const event = JSON.parse(message);
        io.emit("job-update", event);
    }
})

io.on("connection", (socket) => {
    console.log(`Dashboard connected: ${socket.id}`);

    socket.on("disconnect", () => {
        console.log(`Dashboard disconnected: ${socket.id}`);
    });
})

httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});