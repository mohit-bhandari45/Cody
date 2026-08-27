import "dotenv/config";
import express, { Request, Response } from "express";
import { reviewQueue } from "./queue/reviewQueue";
import { verifyGithubSignature } from "./verifySignature";
import { Server } from "socket.io";
import { createServer } from "http";
import Redis from "ioredis";
import path from "path";


const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*" }
})
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
    console.error("Missing GITHUB_WEBHOOK_SECRET in .env");
    process.exit(1);
}

app.use(
    express.json({
        verify: (req: Request, _res: Response, buf: Buffer) => {
            (req as any).rawBody = buf;
        },
    })
);
app.use(express.static(path.join(__dirname, "../public")));

app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
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
    if (action != "opened" && action != "synchronize") {
        console.log(`Ignore pull_request action: ${action}`);
        return;
    }

    const pr = req.body.pull_request;
    const repo = req.body.repository;

    console.log(`[pull_request:${action}] ${repo.full_name} #${pr.number} — "${pr.title}"`);

    try {
        await reviewQueue.add("review-pr", {
            owner: repo.owner.login,
            repo: repo.name,
            pullNumber: pr.number
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
    if(channel === "job-updates") {
        const event = JSON.parse(message);
        io.emit("job-update", event);
    }
})

io.on("connection", (socket) => {
    console.log(`Dashboard connected: ${socket.id}`);

    socket.on("disconnect", () =>{
        console.log(`Dashboard disconnected: ${socket.id}`);
    });
})

httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});