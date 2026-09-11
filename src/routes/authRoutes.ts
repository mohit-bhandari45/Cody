import { Router, Request, Response } from "express";

export const authRouter = Router();

const isProduction = process.env.NODE_ENV === "production" || process.env.RENDER === "true";
const PORT = process.env.PORT || 3000;

const clientUrl = isProduction
    ? (process.env.PROD_CLIENT_URL || "https://cody-delta-ten.vercel.app")
    : (process.env.DEV_CLIENT_URL || "http://localhost:5173");

const serverUrl = isProduction
    ? (process.env.PROD_SERVER_URL || "https://cody-1.onrender.com")
    : (process.env.DEV_SERVER_URL || `http://localhost:${PORT}`);

authRouter.get("/github", (_req: Request, res: Response) => {
    const clientId = process.env.GITHUB_CLIENT_ID || "Iv23liCBquYLO35ElLLF";
    const redirectUri = encodeURIComponent(`${serverUrl}/api/auth/github/callback`);
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=read:user,repo`;
    return res.redirect(githubAuthUrl);
});

authRouter.get("/github/callback", async (req: Request, res: Response) => {
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

authRouter.get("/me", async (req: Request, res: Response) => {
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
