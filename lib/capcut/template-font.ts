/** Replace font references, including CapCut's JSON-encoded text styles. */
export function patchTemplateFontPaths(value: unknown, fontPath: string, fontName?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => patchTemplateFontPaths(entry, fontPath, fontName));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const result = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (key === "font_path") {
        return [key, fontPath];
      }
      if (key === "font" && entry && typeof entry === "object" && !Array.isArray(entry)) {
        return [key, { ...entry, path: fontPath, ...(fontName ? { name: fontName } : {}) }];
      }
      if (key === "content" && typeof entry === "string") {
        try {
          return [key, JSON.stringify(patchTemplateFontPaths(JSON.parse(entry), fontPath, fontName))];
        } catch {
          return [key, entry];
        }
      }
      return [key, patchTemplateFontPaths(entry, fontPath, fontName)];
    }),
  );
  if (fontName && "font_path" in result) {
    result.font_name = fontName;
    result.font_title = fontName;
  }
  return result;
}
