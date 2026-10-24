import "server-only";

// Minimal Gemini client (REST). The key stays server-side in .env; nothing here is
// ever sent to the browser. Used for internal research jobs and, later, the AI agent.

export interface GroundedAnswer {
  text: string;
  sources: { title: string; uri: string }[];
}

export const geminiEnabled = () => !!process.env.GEMINI_API_KEY;

export async function geminiGenerate(prompt: string, opts: { search?: boolean; system?: string; timeoutMs?: number } = {}): Promise<GroundedAnswer> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    body: JSON.stringify({
      ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      ...(opts.search ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: { temperature: 0 },
    }),
  });
  if (res.status === 429) throw new Error("Gemini rate limit reached");
  if (!res.ok) throw new Error(`Gemini returned ${res.status}`);
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[];
  };
  const c = body.candidates?.[0];
  return {
    text: (c?.content?.parts ?? []).map((p) => p.text ?? "").join(""),
    sources: (c?.groundingMetadata?.groundingChunks ?? []).flatMap((g) => (g.web?.uri ? [{ title: g.web.title ?? "", uri: g.web.uri }] : [])),
  };
}
