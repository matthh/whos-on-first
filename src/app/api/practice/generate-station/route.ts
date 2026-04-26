import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";

interface RequestBody {
  name?: string;
  description?: string;
  ageRange?: string; // e.g. "7-8"
}

interface StationGuide {
  setup: string;
  drills: string[];
  coachQuote: string;
}

const SYSTEM_PROMPT = `You are an experienced youth baseball coach writing concise practice-station instructions for a coach's printable practice plan. You match the voice and structure of an existing in-app station library: punchy, encouraging, age-appropriate, never preachy.

For the requested station, output JSON ONLY (no markdown, no prose) matching this exact shape:

{
  "setup": "<one to two sentences describing the equipment + spacing + group structure for the station>",
  "drills": ["<drill 1>", "<drill 2>", "<drill 3>"],
  "coachQuote": "<one short, energetic coaching cue in quotes that the coach can yell during the drill>"
}

Rules:
- Exactly 3 drills. Each drill is one short sentence (under 15 words ideally), action-first, with a rep/duration cue when natural ("8 reps", "6 swings", "30 seconds", etc.).
- Tailor the difficulty to the age range provided. 5-6 and 7-8 = simple language, fun framing, fewer reps; 9-10 and 11-12 = mechanics-focused; 13-14 = game-speed reps and decision-making.
- The coach quote is in double quotes inside the string (already escaped — write the literal characters), 1-2 short phrases. Do not exceed ~14 words.
- If the station name is generic (e.g. "Hitting") and the description gives a specific focus (e.g. "two-strike approach"), tailor the drills to the description.
- Never mention LLMs, AI, JSON, or anything meta. Write only the practice content.
- Keep it baseball-specific. If the input doesn't seem related to baseball/softball, return your best baseball interpretation rather than refusing.`;

function isStationGuide(value: unknown): value is StationGuide {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.setup === "string" &&
    Array.isArray(v.drills) &&
    v.drills.every((d) => typeof d === "string") &&
    typeof v.coachQuote === "string"
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  const description = body.description?.trim() || "";
  const ageRange = body.ageRange?.trim() || "9-10";

  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Station name required" }, { status: 400 });
  }
  if (name.length > 80 || description.length > 800) {
    return NextResponse.json({ error: "Input too long" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "LLM not configured" }, { status: 503 });
  }

  const userMessage = description
    ? `Station name: "${name}"\nAge range: ${ageRange}\nWhat the coach wants to teach: ${description}`
    : `Station name: "${name}"\nAge range: ${ageRange}`;

  const client = new Anthropic({ apiKey });
  let raw: string;
  try {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const first = resp.content[0];
    if (!first || first.type !== "text") {
      return NextResponse.json({ error: "Model returned no text" }, { status: 502 });
    }
    raw = first.text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `LLM call failed: ${msg}` }, { status: 502 });
  }

  // Strip any stray fences and clip to outermost JSON braces.
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch {
    return NextResponse.json({ error: "Model returned invalid JSON", raw: raw.slice(0, 400) }, { status: 502 });
  }
  if (!isStationGuide(parsed)) {
    return NextResponse.json({ error: "Model returned wrong shape", raw: raw.slice(0, 400) }, { status: 502 });
  }
  // Trim drills to exactly 3 entries (model is told to do this but we enforce)
  const guide: StationGuide = {
    setup: parsed.setup,
    drills: parsed.drills.slice(0, 3),
    coachQuote: parsed.coachQuote,
  };
  return NextResponse.json(guide);
}
