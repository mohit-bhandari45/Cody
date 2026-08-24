import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

export async function reviewDiff(diffText: string): Promise<string> {
    const prompt = `
        You are a senior software engineer reviewing a pull request.
        Given the following code diff, provide:
        1. A short summary of what changed.
        2. Any potential bugs or logic issues.
        3. Any style or readability concerns.

        Diff:
        ${diffText}
    `;

    const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
    })

    return response.text ?? "(no response from the model)";
}

