import Redis from "ioredis";
import "dotenv/config";

const publisher = new Redis(process.env.REDIS_URL!);

export function publishJobUpdate(event: {
    jobId: string;
    stage: string;
    data?: Record<string, unknown>
}) {
    publisher.publish("job-updates", JSON.stringify(event));
}