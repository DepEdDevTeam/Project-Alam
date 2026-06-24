// Suggests human-friendly descriptions for each column of a dataset collection,
// using OpenAI with tool calling for structured JSON output.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).in("role", ["admin", "super_admin"]).limit(1);
    if (!roleRows || roleRows.length === 0) return json({ error: "Admin only" }, 403);

    const { collection_id, columns } = await req.json();
    if (!collection_id || !Array.isArray(columns) || columns.length === 0) {
      return json({ error: "collection_id and columns[] required" }, 400);
    }

    const { data: col } = await supabase.from("collections").select("name,description").eq("id", collection_id).maybeSingle();
    const { data: sample } = await supabase.from("dataset_rows").select("data").eq("collection_id", collection_id).limit(8);
    const sampleRows = (sample ?? []).map((r: any) => r.data);

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You generate concise (1 short sentence, max ~120 chars) plain-English descriptions for each column of a DepEd dataset. Be specific — name the unit, meaning, or domain when obvious from the column name or sample values. If unsure, say so briefly." },
          { role: "user", content: `Dataset: ${col?.name ?? "(unknown)"}\nExisting note: ${col?.description ?? "(none)"}\n\nColumns: ${JSON.stringify(columns)}\n\nSample rows (up to 8):\n${JSON.stringify(sampleRows).slice(0, 6000)}\n\nReturn a description for EVERY column listed.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "submit_descriptions",
            description: "Return one description per column.",
            parameters: {
              type: "object",
              properties: {
                descriptions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { name: { type: "string" }, description: { type: "string" } },
                    required: ["name", "description"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["descriptions"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "submit_descriptions" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      if (aiResp.status === 429) return json({ error: "Rate limited, try again shortly." }, 429);
      if (aiResp.status === 402) return json({ error: "AI credits exhausted." }, 402);
      console.error("AI error", aiResp.status, t);
      return json({ error: "AI error" }, 500);
    }

    const ai = await aiResp.json();
    const args = ai.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let descriptions: { name: string; description: string }[] = [];
    try { descriptions = JSON.parse(args ?? "{}").descriptions ?? []; } catch { descriptions = []; }

    return json({ ok: true, descriptions });
  } catch (e) {
    console.error("suggest-column-descriptions error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
