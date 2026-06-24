// Generates a concise, human-readable context summary for a document by
// sampling its chunks and asking OpenAI to produce a structured brief.
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

    const { document_id } = await req.json();
    if (!document_id) return json({ error: "document_id required" }, 400);

    const { data: doc } = await supabase.from("documents").select("title,source_filename,doc_type,total_pages").eq("id", document_id).maybeSingle();
    if (!doc) return json({ error: "Document not found" }, 404);

    // Sample chunks: take first N + a few from the middle/end for coverage.
    const { data: firstChunks } = await supabase
      .from("document_chunks")
      .select("page_number,chunk_index,content")
      .eq("document_id", document_id)
      .order("chunk_index", { ascending: true })
      .limit(20);

    const { count } = await supabase
      .from("document_chunks")
      .select("*", { count: "exact", head: true })
      .eq("document_id", document_id);

    const sample = (firstChunks ?? []).map((c: any) => `[p${c.page_number ?? "?"}] ${String(c.content ?? "").slice(0, 600)}`).join("\n\n");

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You produce a concise but information-rich context brief for a DepEd document so a downstream RAG chatbot can answer questions accurately. Use clear Markdown with short sections: Summary, Key Topics, Entities/Programs Mentioned, Intended Use. Be specific — name programs, acronyms, dates, and policies when present. ~200-300 words." },
          { role: "user", content: `Title: ${doc.title}\nFilename: ${doc.source_filename}\nType: ${doc.doc_type}\nPages: ${doc.total_pages ?? "?"} | Chunks: ${count ?? "?"}\n\nSample content:\n${sample.slice(0, 12000)}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "submit_context",
            description: "Return the document context brief as Markdown.",
            parameters: {
              type: "object",
              properties: { context: { type: "string", description: "Markdown context brief" } },
              required: ["context"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "submit_context" } },
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
    let context = "";
    try { context = JSON.parse(args ?? "{}").context ?? ""; } catch { context = ""; }

    if (context) {
      await supabase.from("documents").update({ ai_parsed_context: context }).eq("id", document_id);
    }

    return json({ ok: true, context });
  } catch (e) {
    console.error("suggest-document-context error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
