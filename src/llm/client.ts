import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

export interface ReviewResult {
    summary: string;
    issues: {
        severity: "bug" | "style" | "suggestion",
        description: string
    }[];
}

export async function reviewDiff(diffText: string): Promise<ReviewResult> {
    const prompt = `
        You are a senior software engineer reviewing a pull request.

        Analyze the following diff and respond wiht ONLY valid json(no markdown, no code fences, no extra text) matching this exact shape:
        {
            "summary": "a short 1-2 sentence summary of what changed",
            "issues": [
                { "severity": "bug" | "style" | "suggestion" , "description": "..." }
            ]
        }

        If there are no issues, return an empty array for "issues".

        Diff:
        ${diffText}
    `;

    const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
    })

    const rawText = response.text ?? "{}";
    const cleaned = rawText.replace(/```json\n?|```/g, "").trim();



    try {
    return JSON.parse(cleaned) as ReviewResult;
  } catch (err) {
    console.error("Failed to parse LLM response as JSON:", rawText);
    return { summary: "Failed to parse review.", issues: [] };
  }
}

