import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const allowedWarnings = new Set(["LOW_CONFIDENCE", "OCR_REQUIRED", "PARTIAL_EXTRACTION", "UNSUPPORTED_STRUCTURE", "VALIDATION_REPAIRED", "EMPTY_SCOPE"]);

type EntityType = "dataset" | "document";
type Body = {
  mode?: "create_dataset" | "append_dataset_rows" | "finalize_dataset";
  entity_type: EntityType;
  filename: string;
  storage_path?: string;
  file_size?: number;
  is_public?: boolean;
  columns?: string[];
  rows?: { sheet: string; data: Record<string, unknown> }[];
  total_rows?: number;
  collection_id?: string;
  parser_output_id?: string;
  start_index?: number;
  total_pages?: number;
  chunks?: { page_number: number | null; chunk_index: number; content: string; section_title?: string | null }[];
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    return [
      e.message,
      e.details,
      e.hint,
      e.code ? `code: ${e.code}` : null,
    ].filter(Boolean).join(" | ") || JSON.stringify(error);
  }
  return String(error);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 72) || `collection-${Date.now()}`;
}

function fileType(filename: string) {
  return filename.split(".").pop()?.toLowerCase() || "unknown";
}

function triggerEmbed(req: Request, entity_type: "dataset" | "document", id: string) {
  try {
    const auth = req.headers.get("Authorization") ?? "";
    fetch(`${SUPABASE_URL}/functions/v1/embed-collection`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json", apikey: ANON_KEY },
      body: JSON.stringify({ entity_type, id }),
    }).catch((e) => console.error("embed trigger failed", e));
  } catch (e) {
    console.error("embed trigger error", e);
  }
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function fallbackSummary(body: Body) {
  if (body.entity_type === "dataset") return `${body.filename} contains ${(body.rows ?? []).length} rows across ${new Set((body.rows ?? []).map((r) => r.sheet)).size || 1} sheet(s).`;
  return `${body.filename} contains ${(body.chunks ?? []).length} materialized text chunks across ${body.total_pages ?? 0} page(s).`;
}

async function summarizeWithAI(body: Body) {
  const sample = body.entity_type === "dataset"
    ? { columns: body.columns ?? [], rows: (body.rows ?? []).slice(0, 8) }
    : { total_pages: body.total_pages ?? 0, chunks: (body.chunks ?? []).slice(0, 5) };

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Return only JSON for a governed parser result. Schema: {\"summary\": string, \"confidence\": number, \"warnings\": string[], \"entities\": string[], \"topics\": string[]}. Use warnings only from LOW_CONFIDENCE, OCR_REQUIRED, PARTIAL_EXTRACTION, UNSUPPORTED_STRUCTURE, VALIDATION_REPAIRED, EMPTY_SCOPE." },
          { role: "user", content: JSON.stringify({ filename: body.filename, entity_type: body.entity_type, sample }) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    const payload = await resp.json();
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}");
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter((w: string) => allowedWarnings.has(w)) : [];
    return {
      raw: parsed,
      summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : fallbackSummary(body),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.72))),
      warnings,
      errors: [],
    };
  } catch (error) {
    return {
      raw: { summary: fallbackSummary(body), confidence: 0.5, warnings: ["LOW_CONFIDENCE"], parser_error: error instanceof Error ? error.message : String(error) },
      summary: fallbackSummary(body),
      confidence: 0.5,
      warnings: ["LOW_CONFIDENCE"],
      errors: [{ message: error instanceof Error ? error.message : String(error) }],
    };
  }
}

async function actorName(supabase: any, userId: string, fallback?: string | null) {
  const { data } = await supabase.from("profiles").select("email,full_name").eq("id", userId).maybeSingle();
  return data?.full_name || data?.email?.split("@")[0] || fallback?.split("@")[0] || "Authenticated user";
}

async function audit(supabase: any, event_type: string, userId: string, actor_display_name: string, entity_type: string, entity_id: string | null, entity_name: string, metadata = {}) {
  await supabase.from("audit_logs").insert({ event_type, actor_user_id: userId, actor_display_name, entity_type, entity_id, entity_name, metadata });
}

async function insertDatasetRows(supabase: any, collectionId: string, parserOutputId: string, rows: NonNullable<Body["rows"]>, startIndex = 0) {
  for (let groupIndex = 0; groupIndex < rows.length; groupIndex += 100) {
    const group = rows.slice(groupIndex, groupIndex + 100);
    const payload = group.map((r, index) => ({
      collection_id: collectionId,
      sheet_name: r.sheet ?? null,
      data: r.data,
      parser_output_id: parserOutputId,
      source_row_index: startIndex + groupIndex + index,
    }));
    const { error: rowError } = await supabase.from("dataset_rows").insert(payload);
    if (rowError) throw new Error(errorMessage(rowError));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const userId = userData.user.id;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "super_admin"]);
    if (!roles?.length) return json({ error: "Admin only" }, 403);

    const body = await req.json() as Body;
    if (!body.filename || !body.entity_type) return json({ error: "filename and entity_type are required" }, 400);
    if (body.entity_type === "dataset" && body.mode !== "finalize_dataset" && (!Array.isArray(body.rows) || !body.rows.length)) return json({ error: "dataset rows are required" }, 400);
    if (body.entity_type === "document" && !Array.isArray(body.chunks)) return json({ error: "document chunks are required" }, 400);

    const actor = await actorName(supabase, userId, userData.user.email);

    if (body.entity_type === "dataset") {
      if (body.mode === "append_dataset_rows") {
        if (!body.collection_id || !body.parser_output_id) return json({ error: "collection_id and parser_output_id required" }, 400);
        await insertDatasetRows(supabase, body.collection_id, body.parser_output_id, body.rows!, Number(body.start_index ?? 0));
        return json({ ok: true, inserted: body.rows!.length });
      }

      if (body.mode === "finalize_dataset") {
        if (!body.collection_id) return json({ error: "collection_id required" }, 400);
        const { data: collection, error: collectionError } = await supabase
          .from("collections")
          .update({ sync_status: "ready", parser_status: "materialized", last_synced_at: new Date().toISOString() })
          .eq("id", body.collection_id)
          .select("id,name")
          .single();
        if (collectionError) throw collectionError;
        await audit(supabase, "CONTEXT_MATERIALIZED", userId, actor, "dataset", collection.id, collection.name, { parser_output_id: body.parser_output_id ?? null, chunked_upload: true });
        triggerEmbed(req, "dataset", collection.id);
        return json({ collection_id: collection.id, parser_output_id: body.parser_output_id ?? null });
      }

      const parsed = await summarizeWithAI(body);
      const validationStatus = parsed.errors.length ? "failed" : "validated";
      const baseSlug = slugify(body.filename);
      const slug = `${baseSlug}-${Date.now().toString(36)}`;
      const { data: collection, error } = await supabase.from("collections").insert({
        name: body.filename.replace(/\.[^.]+$/, ""),
        slug,
        description: parsed.summary,
        is_public: body.is_public ?? true,
        row_count: body.total_rows ?? body.rows!.length,
        columns_meta: body.columns ?? [],
        sync_status: body.mode === "create_dataset" ? "syncing" : parsed.errors.length ? "error" : "ready",
        created_by: userId,
        last_synced_at: new Date().toISOString(),
        parser_summary: parsed.summary,
        ai_parsed_context: parsed.summary,
        parser_status: body.mode === "create_dataset" ? "pending" : parsed.errors.length ? "failed" : "materialized",
        parser_warnings: parsed.warnings,
        parser_confidence: parsed.confidence,
        parser_validation_errors: parsed.errors,
        source_filename: body.filename,
        storage_path: body.storage_path ?? null,
      }).select("id,name").single();
      if (error) throw error;

      const { data: parserOutput, error: parserError } = await supabase.from("parser_outputs").insert({
        entity_type: "dataset",
        collection_id: collection.id,
        source_filename: body.filename,
        source_storage_path: body.storage_path ?? null,
        file_type: fileType(body.filename),
        scope_type: "workbook",
        scope_label: body.filename,
        raw_output: parsed.raw,
        normalized_summary: parsed.summary,
        confidence: parsed.confidence,
        warnings: parsed.warnings,
        validation_status: validationStatus,
        validation_errors: parsed.errors,
        materialized_at: new Date().toISOString(),
        created_by: userId,
      }).select("id").single();
      if (parserError) throw parserError;

      await insertDatasetRows(supabase, collection.id, parserOutput.id, body.rows!, Number(body.start_index ?? 0));
      await audit(supabase, "FILE_UPLOADED", userId, actor, "dataset", collection.id, collection.name, { filename: body.filename });
      await audit(supabase, "STRUCTURE_VALIDATED", userId, actor, "dataset", collection.id, collection.name, { warnings: parsed.warnings, validation_errors: parsed.errors });
      if (body.mode !== "create_dataset") {
        await audit(supabase, "CONTEXT_MATERIALIZED", userId, actor, "dataset", collection.id, collection.name, { parser_output_id: parserOutput.id, summary: parsed.summary });
        triggerEmbed(req, "dataset", collection.id);
      }
      return json({ collection_id: collection.id, parser_output_id: parserOutput.id });
    }

    const parsed = await summarizeWithAI(body);
    const validationStatus = parsed.errors.length ? "failed" : "validated";
    const docType = "other";
    const { data: document, error } = await supabase.from("documents").insert({
      title: body.filename.replace(/\.[^.]+$/, ""),
      description: parsed.summary,
      source_filename: body.filename,
      storage_path: body.storage_path ?? null,
      doc_type: docType,
      total_pages: body.total_pages ?? 0,
      is_public: body.is_public ?? true,
      uploaded_by: userId,
      file_size_bytes: body.file_size ?? null,
      metadata: { file_type: fileType(body.filename) },
      parser_summary: parsed.summary,
      ai_parsed_context: parsed.summary,
      parser_status: parsed.errors.length ? "failed" : "materialized",
      parser_warnings: parsed.warnings,
      parser_confidence: parsed.confidence,
      parser_validation_errors: parsed.errors,
    }).select("id,title").single();
    if (error) throw error;

    const { data: parserOutput, error: parserError } = await supabase.from("parser_outputs").insert({
      entity_type: "document",
      document_id: document.id,
      source_filename: body.filename,
      source_storage_path: body.storage_path ?? null,
      file_type: fileType(body.filename),
      scope_type: "document",
      scope_label: body.filename,
      raw_output: parsed.raw,
      normalized_summary: parsed.summary,
      confidence: parsed.confidence,
      warnings: parsed.warnings,
      validation_status: validationStatus,
      validation_errors: parsed.errors,
      materialized_at: new Date().toISOString(),
      created_by: userId,
    }).select("id").single();
    if (parserError) throw parserError;

    for (const group of chunk(body.chunks ?? [], 300)) {
      const payload = group.map((c) => ({ document_id: document.id, page_number: c.page_number ?? null, chunk_index: c.chunk_index, content: c.content, section_title: c.section_title ?? null, parser_output_id: parserOutput.id, metadata: {} }));
      const { error: chunkError } = await supabase.from("document_chunks").insert(payload);
      if (chunkError) throw chunkError;
    }
    await audit(supabase, "FILE_UPLOADED", userId, actor, "document", document.id, document.title, { filename: body.filename });
    await audit(supabase, "STRUCTURE_VALIDATED", userId, actor, "document", document.id, document.title, { warnings: parsed.warnings, validation_errors: parsed.errors });
    await audit(supabase, "CONTEXT_MATERIALIZED", userId, actor, "document", document.id, document.title, { parser_output_id: parserOutput.id, summary: parsed.summary });
    triggerEmbed(req, "document", document.id);
    return json({ document_id: document.id, parser_output_id: parserOutput.id });
  } catch (error) {
    console.error(error);
    return json({ error: errorMessage(error) }, 500);
  }
});
