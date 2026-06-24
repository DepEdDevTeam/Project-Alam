import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Upload, School, CheckCircle2, XCircle, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SchoolsBrowser } from "./SchoolsBrowser";

const norm = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const ALIASES: Record<string, string[]> = {
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
function autoMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const used = new Set<string>();
  for (const field of Object.keys(ALIASES)) {
    for (const h of headers) {
      if (used.has(h)) continue;
      if (ALIASES[field].includes(norm(h))) { map[field] = h; used.add(h); break; }
    }
  }
  return map;
}

const CANONICAL_FIELDS = [
  { key: "school_id", label: "School ID", required: true },
  { key: "school_name", label: "School Name" },
  { key: "region", label: "Region" },
  { key: "division", label: "Division" },
  { key: "district", label: "District" },
  { key: "municipality", label: "Municipality / City" },
  { key: "province", label: "Province" },
  { key: "barangay", label: "Barangay" },
  { key: "sector", label: "Sector" },
  { key: "school_management", label: "School Management" },
  { key: "school_subclassification", label: "Sub-classification" },
  { key: "street_address", label: "Street Address" },
  { key: "latitude", label: "Latitude" },
  { key: "longitude", label: "Longitude" },
];

type Job = {
  id: string;
  filename: string;
  status: string;
  total_rows: number;
  processed_rows: number;
  inserted_rows: number;
  error_message: string | null;
  created_at: string;
};

export const SchoolsMaster = () => {
  const [count, setCount] = useState<number>(0);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sample, setSample] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [ingesting, setIngesting] = useState(false);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  const loadCount = async () => {
    const { count } = await supabase.from("schools").select("*", { count: "exact", head: true });
    setCount(count ?? 0);
  };

  const loadJobs = async () => {
    const { data } = await supabase.from("schools_ingest_jobs").select("*").order("created_at", { ascending: false }).limit(10);
    setJobs((data ?? []) as Job[]);
  };

  useEffect(() => { loadCount(); loadJobs(); }, []);

  // Poll active job
  useEffect(() => {
    if (!activeJob || activeJob.status === "done" || activeJob.status === "error") return;
    const t = setInterval(async () => {
      const { data } = await supabase.from("schools_ingest_jobs").select("*").eq("id", activeJob.id).maybeSingle();
      if (data) {
        setActiveJob(data as Job);
        if (data.status === "done") {
          toast.success(`Imported ${data.inserted_rows.toLocaleString()} schools`);
          loadCount();
          loadJobs();
        } else if (data.status === "error") {
          toast.error(data.error_message || "Ingest failed");
          loadJobs();
        }
      }
    }, 1500);
    return () => clearInterval(t);
  }, [activeJob]);

  const handleUploadAndPreview = async () => {
    if (!file) return;
    setUploading(true);
    try {
      // Parse headers + sample CLIENT-SIDE (avoids edge function memory limit)
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", sheetRows: 50 });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: null, raw: false });
      const hdrs = rows.length > 0 ? Object.keys(rows[0]) : [];
      if (hdrs.length === 0) throw new Error("No columns detected in file");

      const path = `schools/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("datasets").upload(path, file, { upsert: false });
      if (upErr) throw upErr;

      setStoragePath(path);
      setHeaders(hdrs);
      setSample(rows.slice(0, 10));
      setMapping(autoMap(hdrs));
      toast.success(`Detected ${hdrs.length} columns`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const startIngest = async () => {
    if (!storagePath || !mapping.school_id) {
      toast.error("Map at least the School ID column");
      return;
    }
    setIngesting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-schools`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          action: "ingest",
          storage_path: storagePath,
          filename: file?.name ?? "schools",
          column_mapping: mapping,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      // load initial job
      const { data: jobRow } = await supabase.from("schools_ingest_jobs").select("*").eq("id", json.job_id).maybeSingle();
      setActiveJob(jobRow as Job);
      toast.success("Ingest started — running in background");
      // reset file selector but keep job visible
      setFile(null); setStoragePath(null); setHeaders([]); setSample([]); setMapping({});
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIngesting(false);
    }
  };

  const reset = () => {
    setFile(null); setStoragePath(null); setHeaders([]); setSample([]); setMapping({});
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <Card>
        <CardContent className="py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <School className="h-8 w-8 text-primary" />
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Schools master</div>
              <div className="text-2xl font-display font-bold">{count.toLocaleString()} schools</div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadCount}><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
        </CardContent>
      </Card>

      {/* Active job banner */}
      {activeJob && activeJob.status !== "done" && activeJob.status !== "error" && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="font-medium">Ingesting {activeJob.filename}…</span>
              <Badge variant="secondary">{activeJob.status}</Badge>
            </div>
            <div className="text-sm text-muted-foreground mb-2">
              {activeJob.processed_rows.toLocaleString()} / {activeJob.total_rows.toLocaleString()} rows processed
              {" · "}
              {activeJob.inserted_rows.toLocaleString()} inserted/updated
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: activeJob.total_rows > 0 ? `${(activeJob.processed_rows / activeJob.total_rows) * 100}%` : "5%" }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload */}
      {!storagePath && (
        <Card>
          <CardHeader>
            <CardTitle>Upload schools master file</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-w-2xl">
            <p className="text-sm text-muted-foreground">
              Upload your DepEd Masterlist of Schools (CSV or XLSX). Must include a school ID column. We'll auto-suggest column mappings on the next step.
            </p>
            <label className="flex items-center gap-3 px-4 py-6 rounded-lg border-2 border-dashed border-border hover:border-primary cursor-pointer">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <div className="flex-1">
                {file ? (
                  <>
                    <div className="font-medium">{file.name}</div>
                    <div className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">Click to select .csv, .xlsx, or .xls</div>
                )}
              </div>
              <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <Button onClick={handleUploadAndPreview} disabled={!file || uploading} className="w-full">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload & preview columns
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Mapping step */}
      {storagePath && headers.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Map columns</CardTitle>
              <Button variant="ghost" size="sm" onClick={reset}>Cancel</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Match your file's columns to the canonical fields. Unmapped columns will be saved in <code className="text-xs">extra</code> JSONB.
            </p>

            <div className="grid gap-3">
              {CANONICAL_FIELDS.map((field) => (
                <div key={field.key} className="grid grid-cols-[1fr_2fr] items-center gap-3">
                  <Label className="text-sm">
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Select
                    value={mapping[field.key] ?? "__none__"}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [field.key]: v === "__none__" ? "" : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="-- not mapped --" /></SelectTrigger>
                    <SelectContent className="max-h-[300px] overflow-y-auto">
                      <SelectItem value="__none__">-- not mapped --</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* Preview */}
            <div>
              <div className="text-sm font-medium mb-2">Sample rows ({sample.length})</div>
              <div className="border border-border rounded-lg overflow-x-auto max-h-64">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.slice(0, 8).map((h) => <TableHead key={h} className="text-xs">{h}</TableHead>)}
                      {headers.length > 8 && <TableHead className="text-xs">+{headers.length - 8} more</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sample.map((row, i) => (
                      <TableRow key={i}>
                        {headers.slice(0, 8).map((h) => (
                          <TableCell key={h} className="text-xs whitespace-nowrap max-w-[200px] truncate">{String(row[h] ?? "")}</TableCell>
                        ))}
                        {headers.length > 8 && <TableCell className="text-xs text-muted-foreground">…</TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <Button onClick={startIngest} disabled={ingesting || !mapping.school_id} className="w-full">
              {ingesting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Confirm mapping & start import
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Schools browser / CRUD */}
      <SchoolsBrowser onChange={loadCount} />

      {/* Job history */}
      {jobs.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent imports</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!confirm("Clear all import history? This won't affect schools data.")) return;
                  const ids = jobs.map((j) => j.id);
                  const { error } = await supabase.from("schools_ingest_jobs").delete().in("id", ids);
                  if (error) toast.error(error.message); else { toast.success("Import history cleared"); loadJobs(); }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Clear all
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="font-medium text-sm">{j.filename}</TableCell>
                    <TableCell>
                      {j.status === "done" && <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30"><CheckCircle2 className="h-3 w-3 mr-1" /> done</Badge>}
                      {j.status === "error" && <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> error</Badge>}
                      {(j.status === "processing" || j.status === "pending") && <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> {j.status}</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {j.inserted_rows.toLocaleString()} / {j.total_rows.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(j.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={async () => {
                          if (!confirm(`Delete import record for "${j.filename}"?`)) return;
                          const { error } = await supabase.from("schools_ingest_jobs").delete().eq("id", j.id);
                          if (error) toast.error(error.message); else { toast.success("Deleted"); loadJobs(); }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
