import { Type } from "@google/genai";
import { getGenAI, type GenAIDeps } from "./genai-client";
import type { AnalysisResult, ImageInput } from "./types";

// "-latest" alias: gemini-2.5-flash returned 404 for new API accounts (verified live);
// the alias tracks the current stable flash model and survives such deprecations.
export const ANALYZER_MODEL = "gemini-flash-latest";

const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    itemCount: { type: Type.INTEGER },
    items: { type: Type.ARRAY, items: { type: Type.STRING } },
    criticalDetails: { type: Type.ARRAY, items: { type: Type.STRING } },
    unwantedObjects: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["itemCount", "items", "criticalDetails", "unwantedObjects"],
};

const ANALYZER_PROMPT =
  "You are writing preservation notes for an image editing model. The photo(s) show one " +
  "children's clothing product (possibly a multi-piece set). Report: itemCount — how many " +
  "garment pieces belong to the product; items — a short name for each piece; " +
  "criticalDetails — every visual detail that must survive editing unchanged: prints and " +
  "their exact placement, logos, text, buttons (count, material), zippers, laces, pockets, " +
  "collar type, fabric texture, exact colors. Be specific and concise. Also report " +
  "unwantedObjects — objects in the FIRST photo that are not part of the product and would " +
  "need removal for a clean catalog shot: hanger, human hand or body, price tag, sticker, " +
  "watermark or text overlay, props, other items. Use an empty array when the first photo " +
  "shows only the product on a plain background.";

export async function analyzeImages(
  images: ImageInput[],
  deps: GenAIDeps = { genAI: getGenAI }
): Promise<AnalysisResult> {
  const ai = deps.genAI();
  const response = await ai.models.generateContent({
    model: ANALYZER_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          ...images.map((img) => ({
            inlineData: { data: img.data, mimeType: img.mimeType },
          })),
          { text: ANALYZER_PROMPT },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: ANALYSIS_SCHEMA,
    },
  });
  const text = response.text;
  if (!text) throw new Error("Analyzer returned no text");
  return JSON.parse(text) as AnalysisResult;
}

export function formatAnalysis(a: AnalysisResult): string {
  const itemsLine = `The product consists of ${a.itemCount} piece(s): ${a.items.join(", ")}.`;
  const details = a.criticalDetails.map((d) => `- ${d}`).join("\n");
  const lines = [itemsLine, `Details that must remain exactly as in the original:\n${details}`];
  if (a.unwantedObjects?.length) {
    lines.push(`Objects to remove (not part of the product): ${a.unwantedObjects.join(", ")}.`);
  }
  return lines.join("\n");
}
