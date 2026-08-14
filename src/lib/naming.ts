// Ukrainian national transliteration (KMU 2010), lowercase, position-independent variant.
const UA_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie",
  ж: "zh", з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "",
  ю: "iu", я: "ia", "'": "", "'": "",
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .split("")
    .map((ch) => UA_MAP[ch] ?? ch)
    .join("")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveFilename(opts: { sku?: string; productName?: string }): string {
  const base = opts.sku?.trim() || opts.productName?.trim();
  // User-surfaced via the /api/save error handler — Ukrainian.
  if (!base) throw new Error("Вкажіть артикул або назву товару для імені файлу");
  const slug = slugify(base);
  if (!slug) throw new Error("З цієї назви не виходить коректне ім'я файлу");
  return slug;
}
