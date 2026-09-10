// Base URL for backend Express API server
// Defaults to http://localhost:3000 in local development, or process.env.VITE_API_URL when deployed on Vercel/production
export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
