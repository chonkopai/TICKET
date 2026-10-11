/** Treat browser and server return destinations identically. Never accept an external redirect. */
export function validatedReturnPath(candidate: string | null | undefined, origin: string, fallback: string): string {
  if (!candidate || candidate.length > 2048 || !candidate.startsWith("/") || candidate.startsWith("//") || [...candidate].some(character => character === "\\" || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return fallback;
  try {
    const resolved = new URL(candidate, origin);
    if (resolved.origin !== origin || resolved.pathname === "/login/telegram/callback") return fallback;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch { return fallback; }
}
