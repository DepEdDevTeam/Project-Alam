import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Canonical fields we extract into typed columns
const CANONICAL_FIELDS = [
  "school_id", "school_name", "region", "division", "district",
  "municipality", "province", "barangay", "sector", "school_management",
  "school_subclassification", "street_address", "latitude", "longitude",
] as const;

const norm = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// Auto-suggest column mapping from headers
function autoMap(headers: string[]): Record<string, string> {
  const aliases: Record<string, string[]> = {
    school_id: ["school_id", "schoolid", "beis_school_id", "deped_id", "school_code", "id"],
    school_name: ["school_name", "schoolname", "name", "school"],
    region: ["region", "region_name"],
    division: ["division", "division_name", "schools_division"],
    district: ["district", "district_name"],
    municipality: ["municipality", "city_municipality", "city", "municipality_city"],
    province: ["province", "province_name"],
    barangay: ["barangay", "brgy"],
    sector: ["sector"],
    school_management: ["school_management", "management", "modified_coc"],
    school_subclassification: ["school_subclassification", "subclassification", "school_classification", "classification"],
    street_address: ["street_address", "address", "street"],
    latitude: ["latitude", "lat"],
    longitude: ["longitude", "lon", "lng", "long"],
  };
  const map: Record<string, string> = {};
  const usedHeaders = new Set<string>();
  for (const field of CANONICAL_FIELDS) {
    for (const h of headers) {
      if (usedHeaders.has(h)) continue;
      if (aliases[field].includes(norm(h))) {
        map[field] = h;
        usedHeaders.add(h);
        break;
      }
    }
  }
  return map;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData } = await supabase.auth.getUser(auth.slice(7));
    const user = userData.user;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", user.id).in("role", ["admin", "super_admin"]).maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { action } = body;

    // ---- ACTION: preview — download a small sample, return headers + auto-map suggestion ----
    if (action === "preview") {
      const { storage_path } = body;
      if (!storage_path) return new Response(JSON.stringify({ error: "storage_path required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const { data: file, error: dlErr } = await supabase.storage.from("datasets").download(storage_path);
      if (dlErr || !file) throw new Error(dlErr?.message ?? "Failed to download file");

      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", sheetRows: 50 });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: null, raw: false });
      const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
      const sample = rows.slice(0, 10);
      const suggestedMapping = autoMap(headers);

      return new Response(JSON.stringify({ headers, sample, suggestedMapping, sheetName }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- ACTION: ingest — parse full file, upsert into schools in chunks ----
    if (action === "ingest") {
      const { storage_path, filename, column_mapping } = body;
      if (!storage_path || !column_mapping?.school_id) {
        return new Response(JSON.stringify({ error: "storage_path and column_mapping with school_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Create job record
      const { data: job, error: jobErr } = await supabase.from("schools_ingest_jobs").insert({
        user_id: user.id,
        storage_path,
        filename,
        status: "processing",
        column_mapping,
      }).select("id").single();
      if (jobErr) throw jobErr;
      const jobId = job.id;

      // Stream + process in background using EdgeRuntime.waitUntil if available
      const processJob = async () => {
        try {
          const { data: file, error: dlErr } = await supabase.storage.from("datasets").download(storage_path);
          if (dlErr || !file) throw new Error(dlErr?.message ?? "Failed to download");

          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: null, raw: false });

          await supabase.from("schools_ingest_jobs").update({ total_rows: rows.length }).eq("id", jobId);

          const CHUNK = 1000;
          let processed = 0;
          let inserted = 0;

          for (let i = 0; i < rows.length; i += CHUNK) {
            const slice = rows.slice(i, i + CHUNK);
            const payload = slice.map((row: any) => {
              const out: Record<string, any> = { extra: {} };
              for (const [field, sourceCol] of Object.entries(column_mapping)) {
                if (!sourceCol) continue;
                const v = row[sourceCol as string];
                if (v === null || v === undefined || v === "") continue;
                if (field === "latitude" || field === "longitude") {
                  const n = parseFloat(String(v));
                  if (!isNaN(n)) out[field] = n;
                } else {
                  out[field] = String(v).trim();
                }
              }
              // unmapped columns → extra
              const mappedSources = new Set(Object.values(column_mapping).filter(Boolean));
              for (const [k, v] of Object.entries(row)) {
                if (!mappedSources.has(k) && v !== null && v !== "") {
                  out.extra[k] = v;
                }
              }
              return out;
            }).filter((r: any) => r.school_id); // require school_id

            if (payload.length > 0) {
              const { error: upErr, count } = await supabase
                .from("schools")
                .upsert(payload, { onConflict: "school_id", count: "exact" });
              if (upErr) throw upErr;
              inserted += count ?? payload.length;
            }
            processed += slice.length;
            await supabase.from("schools_ingest_jobs").update({
              processed_rows: processed,
              inserted_rows: inserted,
            }).eq("id", jobId);
          }

          await supabase.from("schools_ingest_jobs").update({
            status: "done",
            processed_rows: processed,
            inserted_rows: inserted,
          }).eq("id", jobId);
        } catch (err) {
          console.error("Job failed:", err);
          await supabase.from("schools_ingest_jobs").update({
            status: "error",
            error_message: err instanceof Error ? err.message : String(err),
          }).eq("id", jobId);
        }
      };

      // Run in background
      // @ts-ignore EdgeRuntime is available in Deno deploy
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(processJob());
      } else {
        processJob(); // fire-and-forget
      }

      return new Response(JSON.stringify({ job_id: jobId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("process-schools error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
