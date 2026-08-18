export interface ImageInput {
  /** base64-encoded image bytes (no data: prefix) */
  data: string;
  mimeType: string;
}

export interface AnalysisResult {
  itemCount: number;
  items: string[];
  criticalDetails: string[];
  /** Objects in the MAIN photo that are not part of the product (hanger,
   *  hand, tag, watermark...). Empty = the photo shows only the product on a
   *  plain background — the deterministic-path gate. */
  unwantedObjects: string[];
}
