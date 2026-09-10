import "dotenv/config";
import { reviewWithGemini, reviewWithGroq } from "./llm/client";

const sampleDiff = `
File: src/utils.js
@@ -5,3 +5,6 @@
 function existing() {
   return 1;
 }
+function divide(a, b) {
+  return a / b;
+}

File: src/math.js
@@ -1,2 +1,7 @@
 function add(a, b) {
   return a + b;
 }
+function getUserAge(birthYear) {
+  const currentYear = 2026;
+  return currentYear - birthYear;
+}
+const ADMIN_ID = 1;
`;

async function test() {
  console.log("Testing Multi-Model Comparison...");

  const [geminiResult, groqResult] = await Promise.all([
    reviewWithGemini(sampleDiff, process.env.GEMINI_API_KEY!),
    reviewWithGroq(sampleDiff, process.env.GROQ_API_KEY!)
  ]);

  console.log("--- GEMINI ---");
  console.log("Summary:", geminiResult.summary);
  console.log("Issues:", JSON.stringify(geminiResult.issues, null, 2));

  console.log("\n--- GROQ (LLAMA 3) ---");
  console.log("Summary:", groqResult.summary);
  console.log("Issues:", JSON.stringify(groqResult.issues, null, 2));
}

test();