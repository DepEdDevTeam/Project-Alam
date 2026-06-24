import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // User-context client: validates JWT
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      console.error("JWT validation failed", userErr);
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = userData.user.id;

    // Admin client for mutations (bypass RLS)
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // admin/super-admin check
    const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "super_admin"]).maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { name, slug, description, columns_meta } = body;
      const { data, error } = await supabase.from("collections").insert({
        name, slug, description, columns_meta, sync_status: "syncing", created_by: userId,
      }).select("id").single();
      if (error) throw error;
      return new Response(JSON.stringify({ collection_id: data.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "insert") {
      const { collection_id, rows } = body;
      if (!Array.isArray(rows) || rows.length === 0) {
        return new Response(JSON.stringify({ error: "rows required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const payload = rows.map((r: any) => ({ collection_id, sheet_name: r.sheet ?? null, data: r.data }));
      const { error } = await supabase.from("dataset_rows").insert(payload);
      if (error) throw error;
      return new Response(JSON.stringify({ inserted: rows.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "finalize") {
      const { collection_id, row_count } = body;
      await supabase.from("collections").update({
        row_count, sync_status: "ready", last_synced_at: new Date().toISOString(),
      }).eq("id", collection_id);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
