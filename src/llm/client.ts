import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ReviewResult {
    summary: string;
    issues: {
        severity: "bug" | "style" | "suggestion",
        description: string,
        file?: string,
        line?: number
    }[];
}

export async function reviewDiff(diffText: string): Promise<ReviewResult> {
    const prompt = `
        You are a senior software engineer reviewing a pull request diff.

        Carefully check the diff for issues in these specific categories:
        1. Input validation — missing checks on ranges, types, or required fields
        2. Edge cases — division by zero, empty arrays/strings, null/undefined access
        3. Hardcoded values that should be computed dynamically
        4. Error handling — missing try/catch, unhandled promise rejections
        5. Security — injection risks, unsanitized input, exposed secrets
        6. Logic errors — off-by-one errors, incorrect comparisons, wrong variable used

        The diff is in unified diff format. Each file section starts with "File: <filename>", followed
        by hunks like "@@ -oldStart,oldCount +newStart,newCount @@". Below each hunk header, lines starting
        with "+" are new lines that exist only in the new file. Lines with no prefix (context lines) exist
        in both old and new files. Lines starting with "-" only existed in the old file and should be
        ignored for line numbering.

        To determine the correct line number in the NEW file for an issue: start counting from newStart
        (the number after "+" in the hunk header). For each line below the header, if it starts with "+"
        or has no prefix, count it as the next line number in sequence. If it starts with "-", skip it
        entirely (do not increment the count). The line number where your flagged code actually appears
        is the number you should report.

        For each issue that can be tied to a specific line, include the exact "file" path (matching the
        "File:" label) and the "line" number in the new file, computed as described above. If an issue is
        general and not tied to one specific line, omit "file" and "line" entirely rather than guessing.

        Respond with ONLY valid JSON (no markdown, no code fences, no extra text) matching this exact shape:

        {
        "summary": "a short 1-2 sentence summary of what changed",
        "issues": [
            {
            "severity": "bug" | "style" | "suggestion",
            "description": "...",
            "file": "path/to/file.js",
            "line": 42
            }
        ]
        }

        Omit "file" and "line" on an issue if you cannot confidently determine the exact line.
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

