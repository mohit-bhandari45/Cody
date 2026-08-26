import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ReviewResult {
    summary: string;
    issues: {
        severity: "bug" | "style" | "suggestion",
        description: string
    }[];
}

export async function reviewDiff(diffText: string): Promise<ReviewResult> {
    const prompt = `
        You are a senior software engineer reviewing a pull request diff.

        Carefully check the diff for issues in these specific categories:
        1. Input validation — missing checks on ranges, types, or required fields (e.g. percentages not bounded 0-100, negative numbers where only positive makes sense)
        2. Edge cases — division by zero, empty arrays/strings, null/undefined access
        3. Hardcoded values that should be computed dynamically (e.g. hardcoded years, dates, or magic numbers)
        4. Error handling — missing try/catch around operations that can fail, unhandled promise rejections
        5. Security — injection risks, unsanitized input, exposed secrets
        6. Logic errors — off-by-one errors, incorrect comparisons, wrong variable used

        For each issue you find, be specific about which line or function it's in and why it's a problem.

        Respond with ONLY valid JSON (no markdown, no code fences, no extra text) matching this exact shape:

        {
        "summary": "a short 1-2 sentence summary of what changed",
        "issues": [
            { "severity": "bug" | "style" | "suggestion", "description": "..." }
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

