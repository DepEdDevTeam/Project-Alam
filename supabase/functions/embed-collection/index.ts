// Embeds dataset_rows and document_chunks via OpenAI.
// POST { entity_type: "dataset"|"document", id: uuid, force?: boolean }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const MODEL = "text-embedding-3-small";
const DIMS = 1536;
const BATCH = 64;

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function rowToText(sheet: string | null, data: Record<string, unknown>): string {
  const parts: string[] = [];
  if (sheet) parts.push(`sheet: ${sheet}`);
  for (const [k, v] of Object.entries(data ?? {})) {
    if (v === null || v === undefined || v === "") continue;
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    parts.push(`${k}: ${s.length > 400 ? s.slice(0, 400) : s}`);
  }
  return parts.join(" | ").slice(0, 8000);
}

async function embedBatch(inputs: string[]): Promise<number[][]> {
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: inputs, dimensions: DIMS }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Embedding API ${resp.status}: ${t.slice(0, 300)}`);
  }
  const j = await resp.json();
  return (j.data as { embedding: number[] }[]).map((d) => d.embedding);
}

async function embedDatasetPage(supabase: any, collectionId: string, force: boolean, offset: number) {
  const PAGE = 500;
  const { data, error } = await supabase
    .from("dataset_rows")
    .select("id,sheet_name,data,embedding_model")
    .eq("collection_id", collectionId)
    .order("id", { ascending: true })
    .range(offset, offset + PAGE - 1);
  if (error) throw error;
  const rows = data ?? [];
  const todo = rows.filter((r: any) => force || r.embedding_model !== MODEL);
  let embedded = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    const texts = slice.map((r: any) => rowToText(r.sheet_name, r.data));
    const vectors = await embedBatch(texts);
    const results = await Promise.all(slice.map((r: any, idx: number) =>
      supabase.from("dataset_rows").update({
        embedding: vectors[idx] as any,
        embedding_model: MODEL,
        embedding_text: texts[idx],
      }).eq("id", r.id),
    ));
    for (const res of results) if (res.error) throw res.error;
    embedded += slice.length;
  }
  const done = rows.length < PAGE;
  return { embedded, page_size: rows.length, next_offset: done ? null : offset + PAGE, done };
}

async function embedDocumentPage(supabase: any, documentId: string, force: boolean, offset: number) {
  const PAGE = 500;
  const { data, error } = await supabase
    .from("document_chunks")
    .select("id,content,section_title,embedding_model")
    .eq("document_id", documentId)
    .order("chunk_index", { ascending: true })
    .range(offset, offset + PAGE - 1);
  if (error) throw error;
  const chunks = data ?? [];
  const todo = chunks.filter((c: any) => force || c.embedding_model !== MODEL);
  let embedded = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    const texts = slice.map((c: any) =>
      (c.section_title ? `${c.section_title}\n` : "") + (c.content || "").slice(0, 8000),
    );
    const vectors = await embedBatch(texts);
    const results = await Promise.all(slice.map((c: any, idx: number) =>
      supabase.from("document_chunks").update({
        embedding: vectors[idx] as any,
        embedding_model: MODEL,
      }).eq("id", c.id),
    ));
    for (const res of results) if (res.error) throw res.error;
    embedded += slice.length;
  }
  const done = chunks.length < PAGE;
  return { embedded, page_size: chunks.length, next_offset: done ? null : offset + PAGE, done };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: u, error: ue } = await userClient.auth.getUser();
    if (ue || !u.user) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).in("role", ["admin", "super_admin"]);
    if (!roles?.length) return json({ error: "Admin only" }, 403);

    const body = await req.json();
    const { entity_type, id, force, offset } = body ?? {};
    if (!entity_type || !id) return json({ error: "entity_type and id required" }, 400);
    const startOffset = Number.isFinite(offset) ? Math.max(0, Number(offset)) : 0;

    const result = entity_type === "dataset"
      ? await embedDatasetPage(supabase, id, !!force, startOffset)
      : entity_type === "document"
      ? await embedDocumentPage(supabase, id, !!force, startOffset)
      : null;
    if (!result) return json({ error: "entity_type must be dataset|document" }, 400);

    return json({ ok: true, ...result, offset: startOffset, model: MODEL });
  } catch (e) {
    console.error("embed-collection error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
