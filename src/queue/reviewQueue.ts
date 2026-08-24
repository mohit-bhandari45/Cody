import { Queue } from "bullmq";
import { connection } from "./connection";

export const reviewQueue = new Queue("review-queue", { connection });