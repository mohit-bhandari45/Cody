import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1", // <-- This is the magic part
});

export interface ReviewResult {
    summary: string;
    issues: {
        severity: "bug" | "style" | "suggestion",
        description: string,
        file?: string,
        line?: number,
        provider?: "gemini" | "groq"
    }[];
}

const SYSTEM_PROMPT = `
        You are a senior software engineer reviewing a pull request diff.
        Perform a thorough, high-quality code review focusing on correctness, maintainability, security, and performance.
        Pay special attention to critical areas such as:
        - Logic & Edge Cases: Division by zero, off-by-one errors, null/undefined access, empty collections.
        - Security & Validation: Unsanitized inputs, missing range/type checks, hardcoded secrets.
        - Reliability & Resource Handling: Missing error handling, unhandled promises, memory leaks, unclosed resources.
        - Performance & Architecture: Inefficient loops (O(N^2)), unnecessary DB calls, breaking contract changes.
        Do NOT restrict yourself to the list above — report ANY valid, high-impact technical issue found in the diff.
        Do NOT report minor opinionated styling preferences.

        The diff is in unified diff format. Each file section starts with "File: <filename>", followed
        by hunks like "@@ -oldStart,oldCount +newStart,newCount @@". Below each hunk header, lines starting
        with "+" are new lines that exist only in the new file. Lines with no prefix (context lines) exist
        in both old and new files. Lines starting with "-" only existed in the old file and should be
        ignored for line numbering.

        IMPORTANT: line numbering is independent per file and per hunk. Every time you see a new "File:"
        label, or a new "@@" hunk header, RESET your line counter to the newStart value from that specific
        hunk header — do not carry over a running count from a previous file or previous hunk.

        To determine the correct line number in the NEW file for an issue: start counting from newStart
        (the number after "+" in the hunk header for that specific hunk). For each line below the header,
        if it starts with "+" or has no prefix, count it as the next line number in sequence. If it starts
        with "-", skip it entirely (do not increment the count).

        For each issue, include the exact "file" path (matching the "File:" label it appeared under) and
        the "line" number computed per the rules above, reset for that file/hunk. If an issue is general
        and not tied to one specific line, omit "file" and "line" entirely rather than guessing.

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
    `;

export async function reviewWithGemini(diffText: string): Promise<ReviewResult> {
    const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: SYSTEM_PROMPT + `\nDiff:\n${diffText}`
    })

    const rawText = response.text ?? "{}";
    const cleaned = rawText.replace(/```json\n?|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as ReviewResult;
    parsed.issues.forEach(i => i.provider = "gemini");
    return parsed;
}

export async function reviewWithGroq(diffText: string): Promise<ReviewResult> {
    const response = await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Diff:\n${diffText}` }
        ]
    });

    const rawText = response.choices[0].message.content ?? "{}";
    try {
        const parsed = JSON.parse(rawText) as ReviewResult;
        parsed.issues.forEach(i => i.provider = "groq");
        return parsed;
    } catch (err) {
        return { summary: "Failed to parse Groq review.", issues: [] };
    }
}