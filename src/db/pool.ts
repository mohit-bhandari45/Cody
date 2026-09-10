import { Pool } from "pg";
import "dotenv/config";

const isProduction = process.env.NODE_ENV === "production" || process.env.RENDER === "true";

const connectionString = isProduction
    ? (process.env.DATABASE_URL_PROD || process.env.DATABASE_URL)
    : (process.env.DATABASE_URL_DEV || process.env.DATABASE_URL || "postgresql://prbot:prbot_dev_password@localhost:5432/pr_review_bot");

const isLocal = !isProduction || connectionString?.includes("localhost") || connectionString?.includes("127.0.0.1");

export const pool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
});