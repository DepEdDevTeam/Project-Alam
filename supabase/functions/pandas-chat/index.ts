// Proxy edge function: forwards multipart admin uploads + question to the
// external Python LangChain Pandas Agent service. Validates admin auth and
// keeps the service URL + shared secret server-side.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PANDAS_AGENT_URL = Deno.env.get("PANDAS_AGENT_URL");
const PANDAS_AGENT_SECRET = Deno.env.get("PANDAS_AGENT_SECRET");

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!PANDAS_AGENT_URL || !PANDAS_AGENT_SECRET) {
    return json(
      {
        error:
          "Pandas agent service is not configured. Set PANDAS_AGENT_URL and PANDAS_AGENT_SECRET in project secrets.",
      },
      500,
    );
  }

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  try {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .in("role", ["admin", "super_admin"]);
    if (!roles?.length) return json({ error: "Admin only" }, 403);

    // Parse incoming multipart form, then rebuild it to forward upstream.
    const incoming = await req.formData();
    const question = String(incoming.get("question") ?? "").trim();
    const files = incoming.getAll("files").filter((v): v is File => v instanceof File);

    if (!question) return json({ error: "`question` is required" }, 400);
    if (files.length === 0) return json({ error: "Upload at least one .csv or .xlsx file" }, 400);

    const fd = new FormData();
    fd.append("question", question);
    for (const file of files) fd.append("files", file, file.name);

    const upstream = await fetch(`${PANDAS_AGENT_URL.replace(/\/$/, "")}/chat`, {
      method: "POST",
      headers: { "X-Service-Token": PANDAS_AGENT_SECRET },
      body: fd,
    });

    const text = await upstream.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    if (!upstream.ok) {
      return json(
        {
          error: `Pandas agent service responded ${upstream.status}`,
          details: payload,
        },
        upstream.status,
      );
    }

    return json(payload);
  } catch (error) {
    console.error("pandas-chat error", error);
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});
