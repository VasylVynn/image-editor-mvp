import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    // User-surfaced via route error handlers — Ukrainian.
    throw new Error("GEMINI_API_KEY не налаштовано. Додайте його у .env.local");
  }
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

export interface GenAIDeps {
  genAI: () => GoogleGenAI;
}
