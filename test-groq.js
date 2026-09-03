require("dotenv/config");
const OpenAI = require("openai");
const groq = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });
async function run() {
  const models = ["llama-3.1-8b-instant", "llama3-70b-8192", "llama3-8b-8192", "mixtral-8x7b-32768", "gemma2-9b-it"];
  for (const m of models) {
    try {
      await groq.chat.completions.create({ model: m, messages: [{role:"user", content:"hi"}]});
      console.log(m + " works!");
    } catch(e) { console.log(m + " failed: " + e.message) }
  }
}
run();
