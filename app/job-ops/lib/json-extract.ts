// Recover the first JSON object/array embedded in arbitrary text.
// Tolerates prose, markdown code fences, and trailing commentary.

const FENCE_LEAD = /^\s*```[a-zA-Z]*\s*/;
const FENCE_TAIL = /\s*```\s*$/;

function tryParse(text: string): { value: unknown; consumed: number } | null {
  // Walk down the string until JSON.parse on a balanced prefix succeeds.
  let depth = 0;
  let inString = false;
  let escape = false;
  const open = text[0];
  if (open !== "{" && open !== "[") return null;
  const close = open === "{" ? "}" : "]";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(0, i + 1);
        try {
          return { value: JSON.parse(candidate), consumed: i + 1 };
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function extractFirstJson(text: string): unknown {
  if (!text) return null;
  const body = text.replace(FENCE_LEAD, "").replace(FENCE_TAIL, "");
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== "{" && ch !== "[") continue;
    const parsed = tryParse(body.slice(i));
    if (parsed) return parsed.value;
  }
  return null;
}
