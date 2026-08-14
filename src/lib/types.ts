export interface ImageInput {
  /** base64-encoded image bytes (no data: prefix) */
  data: string;
  mimeType: string;
}

export interface AnalysisResult {
  itemCount: number;
  items: string[];
  criticalDetails: string[];
}
