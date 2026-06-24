import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: { user } } = await supabase.auth.getUser(auth.slice(7));
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    const { data: admin } = await supabase.from("user_roles").select("role").eq("user_id", user.id).in("role", ["admin", "super_admin"]).maybeSingle();
    if (!admin) return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: corsHeaders });

    const { collection_id } = await req.json();
    const { data: col } = await supabase.from("collections").select("*").eq("id", collection_id).maybeSingle();
    if (!col) return new Response(JSON.stringify({ error: "Collection not found" }), { status: 404, headers: corsHeaders });

    const { data: sample } = await supabase.from("dataset_rows").select("data").eq("collection_id", collection_id).limit(20);
    const summary = (sample ?? []).slice(0, 5).map((r: any) => r.data);

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Given sample rows, produce a 1-sentence description and 3 example questions a DepEd staff member might ask. Return JSON: {description:string, examples:string[]}." },
          { role: "user", content: `Collection: ${col.name}\nSamples:\n${JSON.stringify(summary)}` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    const ai = await aiResp.json();
    let parsed: any = {};
    try { parsed = JSON.parse(ai.choices?.[0]?.message?.content ?? "{}"); } catch {}

    if (parsed.description && !col.description) {
      await supabase.from("collections").update({ description: parsed.description, sync_status: "ready", last_synced_at: new Date().toISOString() }).eq("id", collection_id);
    } else {
      await supabase.from("collections").update({ sync_status: "ready", last_synced_at: new Date().toISOString() }).eq("id", collection_id);
    }

    return new Response(JSON.stringify({ ok: true, ...parsed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: corsHeaders });
  }
});
