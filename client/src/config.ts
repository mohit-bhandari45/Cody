// Base URL for backend Express API server
// Automatically resolves to https://cody-1.onrender.com in production / Vercel, or http://localhost:3000 in local development
const isProd = import.meta.env.PROD || (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1");

export const API_BASE_URL = import.meta.env.VITE_API_URL || (isProd ? "https://cody-1.onrender.com" : "http://localhost:3000");
