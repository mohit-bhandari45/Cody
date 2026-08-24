import { ConnectionOptions } from "bullmq"
import "dotenv/config"

export const connection: ConnectionOptions = {
    url: process.env.REDIS_URL
}