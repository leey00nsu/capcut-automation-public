/** Replace font references, including CapCut's JSON-encoded text styles. */
export function patchTemplateFontPaths(value: unknown, fontPath: string): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => patchTemplateFontPaths(entry, fontPath));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (key === "font_path") {
        return [key, fontPath];
      }
      if (key === "font" && entry && typeof entry === "object" && !Array.isArray(entry)) {
        return [key, { ...entry, path: fontPath }];
      }
      if (key === "content" && typeof entry === "string") {
        try {
          return [key, JSON.stringify(patchTemplateFontPaths(JSON.parse(entry), fontPath))];
        } catch {
          return [key, entry];
        }
      }
      return [key, patchTemplateFontPaths(entry, fontPath)];
    }),
  );
}
