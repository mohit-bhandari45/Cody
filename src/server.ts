import "dotenv/config";
import express, { Request, Response } from "express";
import { verifyGithubSignature } from "./verifySignature";

const app = express();
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

app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
});

app.post("/webhook", (req: Request, res: Response) => {
    const signature = req.header("x-hub-signature-256");
    const rawBody = (req as any).rawBody as Buffer;

    const isValid = verifyGithubSignature(rawBody, signature, WEBHOOK_SECRET);
    if (!isValid) {
        console.warn("Rejected webhook: invalid or missing signature");
        return res.status(401).json({ error: "Invalid signature" });
    }

    console.log("Verified webhook received!");
    console.log("Body:", req.body);

    res.status(200).json({ received: true });
})

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});