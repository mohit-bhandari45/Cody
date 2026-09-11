import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import { createServer } from "http";
import Redis from "ioredis";
import { Server } from "socket.io";

import { authRouter } from "./routes/authRoutes";
import { repoRouter } from "./routes/repoRoutes";
import { webhookRouter } from "./routes/webhookRoutes";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*" }
});
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
    console.error("Missing GITHUB_WEBHOOK_SECRET in .env");
    process.exit(1);
}

// CORS Middleware
app.use((_req: Request, res: Response, next: NextFunction) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (_req.method === "OPTIONS") return res.sendStatus(200);
    next();
});

// JSON Body Parser with raw body retention for HMAC verification
app.use(
    express.json({
        verify: (req: Request, _res: Response, buf: Buffer) => {
            (req as any).rawBody = buf;
        },
    })
);

// Health Check
app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
});

// Register Modular Routers
app.use("/api/auth", authRouter);
app.use("/api/repo", repoRouter);
app.use("/webhook", webhookRouter);

// Redis Pub/Sub Subscriber for Socket.IO Realtime Telemetry
const subscriber = new Redis(process.env.REDIS_URL!);
subscriber.subscribe("job-updates");

subscriber.on("message", (channel, message) => {
    if (channel === "job-updates") {
        try {
            const event = JSON.parse(message);
            io.emit("job-update", event);
        } catch (err) {
            console.error("Failed to parse Redis job update message:", err);
        }
    }
});

io.on("connection", (socket) => {
    console.log(`Dashboard connected: ${socket.id}`);

    socket.on("disconnect", () => {
        console.log(`Dashboard disconnected: ${socket.id}`);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});