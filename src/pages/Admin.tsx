import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import {
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  Database,
  Download,
  Edit3,
  Eye,
  FileText,
  Globe2,
  Lock,
  Loader2,
  Moon,
  RefreshCw,
  Settings,
  Sparkles,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  User,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useThemeMode } from "@/hooks/useThemeMode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { ACCEPTED_FILE_TYPES, isDocumentFile, isSpreadsheetFile, parseDocxAsDocument, parsePdfAsDocument, parseUploadedFile } from "@/lib/fileParsers";
import type { Tables } from "@/integrations/supabase/types";

type AppRole = "user" | "admin" | "super_admin";
type Role = "Super Admin" | "Admin" | "User";
type AdminContentTab = "users" | "collections" | "audit" | "settings";
type CollectionTab = "datasets" | "documents";
type UploadProgress = {
  fileName: string;
  stage: string;
  detail: string;
  current: number;
  total: number;
  status: "running" | "success" | "error";
};
type AuditEventType =
  | "FILE_UPLOADED"
  | "STRUCTURE_VALIDATED"
  | "CONTEXT_MATERIALIZED"
  | "CONTEXT_USED_IN_CHAT"
  | "CONTEXT_UPDATED"
  | "DATASET_DELETED"
  | "DOCUMENT_DELETED"
  | "DOCUMENT_DOWNLOADED"
  | "SYNC_ALL_STATUS_REFRESHED"
  | "DATASET_SYNC_STATUS_REFRESHED"
  | "DOCUMENT_SYNC_STATUS_REFRESHED"
  | "SYNC_STATUS_REFRESH_FAILED";

type KpiMetric = { label: string; value: string };
type DashboardStats = { queriesLast24h: number; visitsLast24h: number; tokensThisMonth: number; tokensToday: number; frequentlyAskedTopic: string };
type DashboardUser = { id: string; name: string; email: string; role: Role };
type ProfileRow = Pick<Tables<"profiles">, "id" | "email" | "full_name">;
type UserRoleRow = Pick<Tables<"user_roles">, "user_id" | "role">;
type AuditLogEntry = { id: string; createdAt: string; time: string; userName: string; action: string; entity: string };
type CollectionRow = Tables<"collections"> & {
  parser_summary?: string | null;
  ai_parsed_context?: string | null;
  parser_status?: string;
  parser_confidence?: number | null;
  parser_warnings?: string[];
  source_filename?: string | null;
  storage_path?: string | null;
};
type DocumentRow = Tables<"documents"> & {
  parser_summary?: string | null;
  ai_parsed_context?: string | null;
  parser_status?: string;
  parser_confidence?: number | null;
  parser_warnings?: string[];
  chunk_count?: number;
};

const ADMIN_RADIUS = "rounded-xl";
const DATASET_UPLOAD_MAX_ROWS_PER_CHUNK = 100;
const DATASET_UPLOAD_MAX_BYTES_PER_CHUNK = 650_000;
const canCurate = (role: AppRole | null) => role === "admin" || role === "super_admin";
const isSuperAdmin = (role: AppRole | null) => role === "super_admin";
const roleLabel = (role?: string | null): Role => (role === "super_admin" ? "Super Admin" : role === "admin" ? "Admin" : "User");
const roleValue = (role: Role): AppRole => (role === "Super Admin" ? "super_admin" : role === "Admin" ? "admin" : "user");
const displayName = (profile: ProfileRow) => profile.full_name || profile.email.split("@")[0];

const Admin = () => {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <NotAdmin email={user.email ?? "this account"} />;
  return <AdminDashboardPage />;
};

const NotAdmin = ({ email }: { email: string }) => (
  <div className="flex h-screen items-center justify-center bg-background p-6">
    <Card className={cn("max-w-md border-border shadow-sm", ADMIN_RADIUS)}>
      <CardHeader><CardTitle>Admin access required</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>{email} is signed in, but this workspace requires an Admin or Super Admin role.</p>
        <p>If your role was just updated, refresh the page or sign out and sign back in.</p>
        <Link to="/chat"><Button variant="outline" className="w-full">Back to chat</Button></Link>
      </CardContent>
    </Card>
  </div>
);

const useCurrentRole = () => {
  const { user, role: authRole } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  useEffect(() => {
    if (authRole) {
      setRole(authRole);
      return;
    }
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      const roles = ((data as UserRoleRow[] | null) ?? []).map((r) => r.role);
      setRole(roles.includes("super_admin" as any) ? "super_admin" : roles.includes("admin" as any) ? "admin" : "user");
    });
  }, [authRole, user]);
  return role;
};

const useDashboardStats = () => {
  const [stats, setStats] = useState<DashboardStats>({ queriesLast24h: 0, visitsLast24h: 0, tokensThisMonth: 0, tokensToday: 0, frequentlyAskedTopic: "No topic data available" });
  useEffect(() => {
    let cancelled = false;
    const loadStats = async () => {
      const now = new Date();
      const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const [{ count }, { data: todayTokens }, { data: monthTokens }] = await Promise.all([
        supabase.from("chat_analytics").select("*", { count: "exact", head: true }).gte("created_at", since24h),
        supabase.from("chat_analytics").select("tokens_in,tokens_out").gte("created_at", since24h).limit(1000),
        supabase.from("chat_analytics").select("tokens_in,tokens_out,collections_used").gte("created_at", monthStart).limit(1000),
      ]);
      if (cancelled) return;
      const sumTokens = (rows: any[] | null) => (rows ?? []).reduce((sum, row) => sum + (row.tokens_in ?? 0) + (row.tokens_out ?? 0), 0);
      const topics = new Map<string, number>();
      ((monthTokens as any[] | null) ?? []).flatMap((r) => r.collections_used ?? []).forEach((name) => topics.set(name, (topics.get(name) ?? 0) + 1));
      const top = [...topics.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      setStats({ queriesLast24h: count ?? 0, visitsLast24h: count ?? 0, tokensThisMonth: Math.round(sumTokens(monthTokens as any[]) / 1000), tokensToday: Math.round(sumTokens(todayTokens as any[]) / 1000), frequentlyAskedTopic: top ?? "No topic data available" });
    };
    loadStats();
    return () => { cancelled = true; };
  }, []);
  return stats;
};

const useAdminUsers = () => {
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const loadUsers = async () => {
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id,email,full_name").order("created_at", { ascending: true }),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    const roleByUser = new Map<string, AppRole>();
    ((roles as UserRoleRow[] | null) ?? []).forEach((row) => {
      if (row.role === "super_admin" || !roleByUser.has(row.user_id)) roleByUser.set(row.user_id, row.role as AppRole);
    });
    setUsers(((profiles as ProfileRow[] | null) ?? []).map((p) => ({ id: p.id, name: displayName(p), email: p.email, role: roleLabel(roleByUser.get(p.id)) })));
  };
  useEffect(() => { loadUsers(); }, []);
  const updateRole = (id: string, role: Role) => setUsers((current) => current.map((user) => (user.id === id ? { ...user, role } : user)));
  const saveRoles = async () => {
    for (const u of users) {
      await supabase.from("user_roles").delete().eq("user_id", u.id);
      await supabase.from("user_roles").insert({ user_id: u.id, role: roleValue(u.role) as any });
    }
    toast.success("Role changes saved");
  };
  return { users, updateRole, saveRoles };
};

const useAuditLogs = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const loadLogs = async () => {
    const { data } = await (supabase as any).from("audit_logs").select("id,created_at,actor_display_name,event_type,entity_name").order("created_at", { ascending: false }).limit(500);
    setLogs(((data as any[] | null) ?? []).map((row) => ({ id: row.id, createdAt: row.created_at, time: new Date(row.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), userName: row.actor_display_name, action: String(row.event_type).replace(/_/g, " "), entity: row.entity_name })));
  };
  useEffect(() => { loadLogs(); }, []);
  return { logs, reload: loadLogs };
};

const useCollectionsData = () => {
  const [datasets, setDatasets] = useState<CollectionRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    const [{ data: cols }, { data: docs }, { data: chunks }] = await Promise.all([
      (supabase as any).from("collections").select("*").order("updated_at", { ascending: false }),
      (supabase as any).from("documents").select("*").order("updated_at", { ascending: false }),
      supabase.from("document_chunks").select("document_id").limit(10000),
    ]);
    const counts = new Map<string, number>();
    ((chunks as any[] | null) ?? []).forEach((c) => counts.set(c.document_id, (counts.get(c.document_id) ?? 0) + 1));
    setDatasets((cols as CollectionRow[] | null) ?? []);
    setDocuments(((docs as DocumentRow[] | null) ?? []).map((doc) => ({ ...doc, chunk_count: counts.get(doc.id) ?? 0 })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const channel = supabase
      .channel("admin-collections-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "collections" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);
  return { datasets, documents, loading, reload: load };
};

const AdminDashboardPage = () => {
  const role = useCurrentRole();
  const { theme, toggleTheme } = useThemeMode();
  const stats = useDashboardStats();
  const { users, updateRole, saveRoles } = useAdminUsers();
  const { logs: auditLogs, reload: reloadAudit } = useAuditLogs();
  const collections = useCollectionsData();
  const [contentTab, setContentTab] = useState<AdminContentTab>("collections");
  const kpis: KpiMetric[] = [
    { label: "Queries last 24H", value: stats.queriesLast24h.toLocaleString() },
    { label: "Visits last 24H", value: stats.visitsLast24h.toLocaleString() },
    { label: "Token Consumed this month", value: currency(stats.tokensThisMonth) },
    { label: "Token Consumed today", value: currency(stats.tokensToday) },
  ];
  const superAdmin = isSuperAdmin(role);
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="deped-header-shell"><div className="container-chat relative z-10 flex h-16 items-center justify-between gap-4"><div className="flex items-center gap-4"><Logo variant="light" /><span className="inline-flex items-center rounded-full bg-secondary px-4 py-1 text-sm font-bold text-secondary-foreground">Admin</span></div><div className="flex items-center gap-2"><Button size="icon" variant="ghost" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} className="text-white hover:bg-white/10 hover:text-white">{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button><Link to="/chat" className="inline-flex items-center gap-2 text-sm font-semibold text-white/85 transition-colors hover:text-white"><ChevronLeft className="h-4 w-4" />Back to chat</Link></div></div></header>
      <div className="container-chat py-6 md:py-8">
        <PrimaryNavigation value={contentTab} onChange={setContentTab} showSettings={superAdmin} />
        {contentTab === "collections" ? <CollectionsPanel role={role} {...collections} onAudit={reloadAudit} /> : contentTab === "settings" && superAdmin ? <SettingsPanel onAudit={reloadAudit} /> : (
          <>
            <section className="mt-6" aria-labelledby="admin-dashboard-title"><h1 id="admin-dashboard-title" className="text-4xl font-semibold tracking-normal text-foreground md:text-5xl">Admin Dashboard</h1><div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{kpis.map((metric) => <KpiCard key={metric.label} label={metric.label} value={metric.value} />)}</div><div className="mt-4 flex justify-center"><InsightCard label="Frequently asked topic" value={stats.frequentlyAskedTopic} /></div><div className="mt-5"><RoleCapabilitiesCard currentRole={role} /></div></section>
            <section className="mt-5 border-t border-border pt-4" aria-label="Admin content">
              <Tabs<AdminContentTab> value={contentTab} onChange={setContentTab} items={[...(superAdmin ? [{ value: "users" as AdminContentTab, label: "User Management", icon: Users }] : []), { value: "audit" as AdminContentTab, label: "Audit Log", icon: ClipboardList }]} />
              <div className="mt-2">{contentTab === "users" && superAdmin ? <UserManagement users={users} onRoleChange={updateRole} onSave={saveRoles} /> : <AuditLogTable rows={auditLogs} />}</div>
            </section>
          </>
        )}
      </div>
    </main>
  );
};

const PrimaryNavigation = ({ value, onChange, showSettings }: { value: AdminContentTab; onChange: (value: AdminContentTab) => void; showSettings: boolean }) => {
  const items: { value: AdminContentTab; label: string; icon: typeof Users }[] = [
    { value: "audit", label: "Admin Dashboard", icon: Users },
    { value: "collections", label: "Collections", icon: Database },
    ...(showSettings ? [{ value: "settings" as AdminContentTab, label: "Settings", icon: Settings }] : []),
  ];
  const isActive = (v: AdminContentTab) => v === "audit" ? (value !== "collections" && value !== "settings") : value === v;
  return <nav className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-muted p-1" aria-label="Admin primary navigation">{items.map((item) => { const Icon = item.icon; const active = isActive(item.value); return <button key={item.label} type="button" onClick={() => onChange(item.value)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors", active && "bg-card text-foreground shadow-sm")}><Icon className="h-4 w-4" />{item.label}</button>; })}</nav>;
};

const CollectionsPanel = ({ role, datasets, documents, loading, reload, onAudit }: { role: AppRole | null; datasets: CollectionRow[]; documents: DocumentRow[]; loading: boolean; reload: () => Promise<void>; onAudit: () => void }) => {
  const [tab, setTab] = useState<CollectionTab>("datasets");
  const [editing, setEditing] = useState<{ type: "dataset" | "document"; id: string; title: string; context: string } | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentRow | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [embeddingAll, setEmbeddingAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const progressDismissTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const canAct = canCurate(role);

  useEffect(() => {
    return () => {
      if (progressDismissTimer.current) window.clearTimeout(progressDismissTimer.current);
    };
  }, []);

  const syncAll = async () => {
    const event = await writeAudit("SYNC_ALL_STATUS_REFRESHED", "system", null, "Collections", { dataset_count: datasets.length, document_count: documents.length });
    if (event) toast.success("Collection statuses refreshed");
    onAudit();
  };
  const reembedAll = async () => {
    if (embeddingAll) return;
    setEmbeddingAll(true);
    let ok = 0, failed = 0, totalEmbedded = 0;
    toast.info(`Re-embedding ${datasets.length} datasets + ${documents.length} documents…`);
    try {
      for (const d of datasets) {
        try { totalEmbedded += await embedEntityPaginated("dataset", d.id); ok++; }
        catch (e) { failed++; console.error("embed dataset failed", d.id, e); }
      }
      for (const d of documents) {
        try { totalEmbedded += await embedEntityPaginated("document", d.id); ok++; }
        catch (e) { failed++; console.error("embed document failed", d.id, e); }
      }
      await writeAudit("CONTEXT_UPDATED" as AuditEventType, "system", null, "Collections", { action: "re_embed_all", ok, failed, embedded: totalEmbedded });
      if (failed === 0) toast.success(`Re-embedded ${ok} items (${totalEmbedded} chunks/rows)`);
      else toast.warning(`Re-embedded ${ok} items, ${failed} failed`);
      onAudit();
    } finally {
      setEmbeddingAll(false);
    }
  };
  const uploadFile = async (file: File) => {
    setUploading(true);
    toast.dismiss();
    if (progressDismissTimer.current) {
      window.clearTimeout(progressDismissTimer.current);
      progressDismissTimer.current = null;
    }
    const setProgress = (patch: Partial<UploadProgress>) => {
      setUploadProgress((current) => ({
        fileName: file.name,
        stage: "Preparing upload",
        detail: "",
        current: 0,
        total: 1,
        status: "running",
        ...current,
        ...patch,
      }));
    };
    const dismissSuccessfulProgress = () => {
      if (progressDismissTimer.current) window.clearTimeout(progressDismissTimer.current);
      progressDismissTimer.current = window.setTimeout(() => {
        setUploadProgress((current) => current?.status === "success" ? null : current);
        progressDismissTimer.current = null;
      }, 3500);
    };
    setProgress({ stage: "Uploading file", detail: "Saving the original file to storage...", current: 0, total: 100 });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const storagePath = `${sessionData.session?.user.id}/${Date.now()}-${file.name}`;
      const bucket = isDocumentFile(file.name) ? "documents" : "datasets";
      const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      setProgress({ stage: "Parsing file", detail: "Reading sheets and detecting headers locally...", current: 10, total: 100 });
      let body: Record<string, unknown> = { filename: file.name, storage_path: storagePath, file_size: file.size, is_public: true };
      let datasetColumns: string[] = [];
      let parseData: unknown = null;
      const formatFunctionError = (value: unknown): string => {
        if (!value) return "";
        if (typeof value === "string") return value;
        if (value instanceof Error) return value.message;
        if (typeof value === "object") {
          const record = value as Record<string, any>;
          return [record.error, record.message, record.details, record.hint, record.code ? `code: ${record.code}` : null]
            .filter(Boolean)
            .map((part) => typeof part === "string" ? part : JSON.stringify(part))
            .join(" | ") || JSON.stringify(value);
        }
        return String(value);
      };
      const invokeParser = async (payload: Record<string, unknown>) => {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-collection-file`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify(payload),
        });
        const text = await response.text();
        let data: any = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = null; }
        if (!response.ok) {
          const message = formatFunctionError(data?.error ?? data ?? text) || `Edge Function failed with status ${response.status}`;
          throw new Error(`${response.status}: ${message}`);
        }
        return data;
      };
      const makeRowChunks = (rows: any[]) => {
        const chunks: { start: number; rows: any[] }[] = [];
        let current: any[] = [];
        let start = 0;
        let bytes = 0;
        rows.forEach((row, index) => {
          const rowBytes = new TextEncoder().encode(JSON.stringify(row)).length;
          const shouldFlush = current.length > 0 && (
            current.length >= DATASET_UPLOAD_MAX_ROWS_PER_CHUNK ||
            bytes + rowBytes > DATASET_UPLOAD_MAX_BYTES_PER_CHUNK
          );
          if (shouldFlush) {
            chunks.push({ start, rows: current });
            start = index;
            current = [];
            bytes = 0;
          }
          current.push(row);
          bytes += rowBytes;
        });
        if (current.length) chunks.push({ start, rows: current });
        return chunks;
      };
      if (isSpreadsheetFile(file.name)) {
        const parsed = await parseUploadedFile(file);
        datasetColumns = (parsed.columns ?? []).map((c: any) => typeof c === "string" ? c : c?.name).filter(Boolean);
        if (parsed.rows.length === 0) throw new Error("No usable rows found in this spreadsheet.");

        const chunks = makeRowChunks(parsed.rows);
        setProgress({
          stage: "Creating dataset",
          detail: `${parsed.rows.length.toLocaleString()} rows split into ${chunks.length.toLocaleString()} batches.`,
          current: 0,
          total: chunks.length + 1,
        });
        const first = chunks[0];
        const created = await invokeParser({
            ...body,
            mode: "create_dataset",
            entity_type: "dataset",
            columns: parsed.columns,
            rows: first.rows,
            total_rows: parsed.rows.length,
        });

        const collectionId = (created as any)?.collection_id;
        const parserOutputId = (created as any)?.parser_output_id;
        if (!collectionId || !parserOutputId) throw new Error("Parser did not return dataset identifiers.");

        for (let i = 1; i < chunks.length; i++) {
          const chunk = chunks[i];
          setProgress({
            stage: "Uploading rows",
            detail: `Batch ${i + 1}/${chunks.length} - rows ${chunk.start + 1}-${Math.min(chunk.start + chunk.rows.length, parsed.rows.length)} of ${parsed.rows.length.toLocaleString()}.`,
            current: i + 1,
            total: chunks.length + 1,
          });
          await invokeParser({
              ...body,
              mode: "append_dataset_rows",
              entity_type: "dataset",
              collection_id: collectionId,
              parser_output_id: parserOutputId,
              rows: chunk.rows,
              start_index: chunk.start,
          });
        }

        setProgress({
          stage: "Finalizing",
          detail: "Marking dataset ready and starting the first embedding pass...",
          current: chunks.length + 1,
          total: chunks.length + 1,
        });
        const finalized = await invokeParser({
            ...body,
            mode: "finalize_dataset",
            entity_type: "dataset",
            collection_id: collectionId,
            parser_output_id: parserOutputId,
        });
        setProgress({ stage: "Upload complete", detail: `${parsed.rows.length.toLocaleString()} rows saved.`, status: "success", current: chunks.length + 1, total: chunks.length + 1 });
        toast.success("File uploaded and queued through parser governance");
        if (parsed.rows.length > 2000) {
          toast.info("Large dataset saved. Use the sparkle Re-embed action to index all rows for semantic chat search.");
        }
        parseData = finalized ?? created;
      } else if (/\.pdf$/i.test(file.name)) {
        setProgress({ stage: "Parsing document", detail: "Extracting PDF text...", current: 25, total: 100 });
        const parsed = await parsePdfAsDocument(file);
        body = { ...body, entity_type: "document", total_pages: parsed.total_pages, chunks: parsed.chunks };
      } else if (/\.docx$/i.test(file.name)) {
        setProgress({ stage: "Parsing document", detail: "Extracting Word document text...", current: 25, total: 100 });
        const parsed = await parseDocxAsDocument(file);
        body = { ...body, entity_type: "document", total_pages: parsed.total_pages, chunks: parsed.chunks };
      } else {
        throw new Error("Unsupported file type");
      }
      if (!parseData) {
        setProgress({ stage: "Saving parsed content", detail: "Sending parsed document to the backend...", current: 70, total: 100 });
        parseData = await invokeParser(body);
        setProgress({ stage: "Upload complete", detail: "Parsed content saved.", status: "success", current: 100, total: 100 });
        toast.success("File uploaded and queued through parser governance");
      }

      // Auto-suggest column descriptions for new datasets
      const newCollectionId = (parseData as any)?.collection_id;
      if (newCollectionId && datasetColumns.length > 0) {
        setProgress({ stage: "Generating column descriptions", detail: "Asking AI to describe each detected column...", status: "running", current: 100, total: 100 });
        toast.info("Auto-generating column descriptions…");
        try {
          const { data: sugg, error: sErr } = await supabase.functions.invoke("suggest-column-descriptions", {
            body: { collection_id: newCollectionId, columns: datasetColumns },
          });
          if (sErr) throw sErr;
          const suggested: { name: string; description: string }[] = (sugg as any)?.descriptions ?? [];
          if (suggested.length > 0) {
            const text = `## Column descriptions\n${suggested.map((s) => `- ${s.name}: ${(s.description || "").trim() || "(no description)"}`).join("\n")}\n`;
            await (supabase as any).from("collections").update({ ai_parsed_context: text }).eq("id", newCollectionId);
            toast.success("Column descriptions auto-filled");
            setProgress({ stage: "Upload complete", detail: "Column descriptions generated.", status: "success", current: 100, total: 100 });
          } else {
            setProgress({ stage: "Upload complete", detail: "Rows saved. No column descriptions were returned.", status: "success", current: 100, total: 100 });
          }
        } catch (e) {
          console.error("auto-suggest failed", e);
          setProgress({ stage: "Upload complete", detail: "Rows saved. Column descriptions can be generated manually.", status: "success", current: 100, total: 100 });
          toast.warning("Auto-suggest skipped — you can run AI Suggest manually");
        }
      }

      // Auto-generate context brief for new documents
      const newDocumentId = (parseData as any)?.document_id;
      if (newDocumentId) {
        setProgress({ stage: "Generating document context", detail: "Asking AI to summarize the uploaded document...", status: "running", current: 100, total: 100 });
        toast.info("Auto-generating document context…");
        try {
          const { error: dErr } = await supabase.functions.invoke("suggest-document-context", {
            body: { document_id: newDocumentId },
          });
          if (dErr) throw dErr;
          toast.success("Document context auto-filled");
          setProgress({ stage: "Upload complete", detail: "Document context generated.", status: "success", current: 100, total: 100 });
        } catch (e) {
          console.error("auto document context failed", e);
          setProgress({ stage: "Upload complete", detail: "Document saved. Context can be generated manually.", status: "success", current: 100, total: 100 });
          toast.warning("Auto-context skipped — you can run AI Suggest manually");
        }
      }

      await reload();
      onAudit();
      dismissSuccessfulProgress();
    } catch (error) {
      setProgress({ stage: "Upload failed", detail: error instanceof Error ? error.message : "Upload failed", status: "error" });
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  return (
    <section className="mt-6 space-y-5" aria-labelledby="collections-title">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 id="collections-title" className="text-4xl font-semibold tracking-normal text-foreground md:text-5xl">Collections</h1><p className="mt-2 text-sm text-muted-foreground">Datasets and documents are data-driven, role-gated, and parser-audited.</p></div>{canAct && <div className="flex gap-2"><input ref={fileRef} type="file" accept={ACCEPTED_FILE_TYPES} className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} /><Button variant="outline" onClick={syncAll}><RefreshCw className="h-4 w-4" /> Sync All</Button><Button variant="outline" onClick={reembedAll} disabled={embeddingAll}>{embeddingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Re-embed All</Button><Button onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload</Button></div>}</div>
      {uploadProgress && <UploadProgressPanel progress={uploadProgress} onDismiss={() => setUploadProgress(null)} />}
      <CollectionHealthSummary datasets={datasets} documents={documents} />
      <Tabs<CollectionTab> value={tab} onChange={setTab} items={[{ value: "datasets", label: "Datasets", icon: Database }, { value: "documents", label: "Documents", icon: FileText }]} />
      {loading ? <div className="flex h-40 items-center justify-center border border-border bg-card"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : tab === "datasets" ? <DatasetsTable rows={datasets} canAct={canAct} reload={reload} onEdit={setEditing} onAudit={onAudit} /> : <DocumentsTable rows={documents} canAct={canAct} reload={reload} onEdit={setEditing} onPreview={setPreviewDoc} onAudit={onAudit} />}
      <ContextEditor editing={editing} onClose={() => setEditing(null)} onSaved={async () => { await reload(); onAudit(); }} />
      <DocumentPreviewDialog document={previewDoc} onClose={() => setPreviewDoc(null)} />
    </section>
  );
};

const toggleEntityVisibility = async ({
  table,
  entityType,
  id,
  name,
  nextValue,
  reload,
  onAudit,
}: {
  table: "collections" | "documents";
  entityType: "dataset" | "document";
  id: string;
  name: string;
  nextValue: boolean;
  reload: () => Promise<void>;
  onAudit: () => void;
}) => {
  const { error } = await (supabase as any).from(table).update({ is_public: nextValue }).eq("id", id);
  if (error) throw error;
  await writeAudit("CONTEXT_UPDATED", entityType, id, name, { action: "visibility_updated", is_public: nextValue });
  await reload();
  onAudit();
};

const VisibilityToggle = ({ publicAccess, canAct, entityLabel, onToggle }: { publicAccess: boolean; canAct: boolean; entityLabel: string; onToggle?: () => Promise<void> }) => {
  const [saving, setSaving] = useState(false);

  if (!canAct || !onToggle) return <AccessBadge publicAccess={publicAccess} />;

  return (
    <button
      type="button"
      onClick={async () => {
        setSaving(true);
        try {
          await onToggle();
          toast.success(`${entityLabel} is now ${publicAccess ? "private" : "public"}.`);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Visibility update failed");
        } finally {
          setSaving(false);
        }
      }}
      disabled={saving}
      className={cn(
        "inline-flex min-w-[112px] items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition",
        publicAccess
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300",
      )}
      aria-label={`Make ${entityLabel} ${publicAccess ? "private" : "public"}`}
      title={`Click to make this ${entityLabel} ${publicAccess ? "private" : "public"}`}
    >
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : publicAccess ? <Globe2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
      {publicAccess ? "Public" : "Private"}
    </button>
  );
};

const DatasetsTable = ({ rows, canAct, reload, onEdit, onAudit }: { rows: CollectionRow[]; canAct: boolean; reload: () => Promise<void>; onEdit: (value: { type: "dataset"; id: string; title: string; context: string }) => void; onAudit: () => void }) => (
  <DataTable headers={["Name", "Rows", "AI Parsed Context", "Visibility", ...(canAct ? ["Actions"] : [])]} empty="No datasets yet.">
    {rows.map((row) => (
      <tr key={row.id} className="h-16 border-b border-border last:border-b-0">
        <td className="px-4"><div className="font-medium text-foreground">{row.name}</div><div className="text-xs text-muted-foreground">{row.slug}</div></td>
        <td className="px-4 text-center text-foreground">{row.row_count.toLocaleString()}</td>
        <td className="max-w-md px-4 text-sm text-muted-foreground"><p className="line-clamp-2">{row.ai_parsed_context || row.parser_summary || row.description || "No parser summary available"}</p></td>
        <td className="px-4 text-center">
          <VisibilityToggle publicAccess={row.is_public} canAct={canAct} entityLabel={row.name} onToggle={() => toggleEntityVisibility({ table: "collections", entityType: "dataset", id: row.id, name: row.name, nextValue: !row.is_public, reload, onAudit })} />
        </td>
        {canAct && <td className="px-4"><div className="flex justify-center gap-1"><IconButton label="Edit context" onClick={() => onEdit({ type: "dataset", id: row.id, title: row.name, context: row.ai_parsed_context || row.parser_summary || "" })}><Edit3 className="h-4 w-4" /></IconButton><IconButton label="Re-embed for semantic search" onClick={async () => { toast.info("Embedding rows..."); try { const embedded = await embedEntityPaginated("dataset", row.id); toast.success(`Embedded ${embedded} rows`); await writeAudit("CONTEXT_UPDATED" as AuditEventType, "dataset", row.id, row.name, { action: "re_embed", embedded }); onAudit(); } catch (e) { toast.error(e instanceof Error ? e.message : "Embedding failed"); } }}><Sparkles className="h-4 w-4" /></IconButton><IconButton label="Refresh status" onClick={async () => { await writeAudit("DATASET_SYNC_STATUS_REFRESHED", "dataset", row.id, row.name); onAudit(); toast.success("Dataset status refreshed"); }}><RefreshCw className="h-4 w-4" /></IconButton><IconButton label="Delete dataset" onClick={async () => { if (!window.confirm(`Delete dataset "${row.name}"? This permanently removes all its rows and cannot be undone.`)) return; const { error } = await (supabase as any).from("collections").delete().eq("id", row.id); if (error) { toast.error(error.message); return; } await writeAudit("DATASET_DELETED", "dataset", row.id, row.name); toast.success("Dataset deleted"); await reload(); onAudit(); }}><Trash2 className="h-4 w-4" /></IconButton></div></td>}
      </tr>
    ))}
  </DataTable>
);

const CollectionHealthSummary = ({ datasets, documents }: { datasets: CollectionRow[]; documents: DocumentRow[] }) => {
  type Health = "ready" | "processing" | "needs-context" | "failed";
  const [selected, setSelected] = useState<Health | null>(null);
  const all = [
    ...datasets.map((row) => ({ ...row, fileType: "Dataset", displayName: row.name })),
    ...documents.map((row) => ({ ...row, fileType: "Document", displayName: row.title })),
  ] as any[];
  const getHealth = (row: any): Health => {
    if (row.sync_status === "error") return "failed";
    if (row.sync_status === "syncing" || row.sync_status === "pending") return "processing";
    if (!(row.ai_parsed_context || row.parser_summary)) return "needs-context";
    return "ready";
  };
  const items = [
    { key: "ready" as Health, label: "Chat-ready", tone: "text-emerald-600 dark:text-emerald-300" },
    { key: "processing" as Health, label: "Processing", tone: "text-primary" },
    { key: "needs-context" as Health, label: "Needs AI context", tone: "text-amber-600 dark:text-amber-300" },
    { key: "failed" as Health, label: "Failed", tone: "text-destructive" },
  ];
  const matching = selected ? all.filter((row) => getHealth(row) === selected) : [];
  const selectedLabel = items.find((item) => item.key === selected)?.label;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {items.map((item) => {
          const count = all.filter((row) => getHealth(row) === item.key).length;
          return (
            <button key={item.label} type="button" onClick={() => setSelected((current) => current === item.key ? null : item.key)} className={cn("border border-border bg-card px-4 py-3 text-left shadow-sm transition hover:border-primary/40 hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring/20", selected === item.key && "border-primary bg-primary/5")}>
              <div className={cn("text-2xl font-semibold", item.tone)}>{count}</div>
              <div className="text-xs font-medium text-muted-foreground">{item.label}</div>
              <div className="mt-1 text-[10px] text-muted-foreground/70">{selected === item.key ? "Click to close" : "Click to view files"}</div>
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="border border-border bg-card p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">{selectedLabel} files</p>
            <span className="text-xs text-muted-foreground">{matching.length} item{matching.length === 1 ? "" : "s"}</span>
          </div>
          {matching.length === 0 ? <p className="text-sm text-muted-foreground">No files currently have this status.</p> : (
            <div className="divide-y divide-border">
              {matching.map((row) => (
                <div key={`${row.fileType}-${row.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{row.displayName}</p>
                    <p className="text-xs text-muted-foreground">{row.fileType}{row.fileType === "Dataset" ? ` · ${Number(row.row_count ?? 0).toLocaleString()} rows` : ` · ${Number(row.total_pages ?? 0).toLocaleString()} pages`}</p>
                  </div>
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{row.sync_status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const UploadProgressPanel = ({ progress, onDismiss }: { progress: UploadProgress; onDismiss: () => void }) => {
  const percent = progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0;
  const tone = progress.status === "error" ? "border-destructive/40 bg-destructive/5" : progress.status === "success" ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card";
  return (
    <div className={cn("rounded-xl border p-4 shadow-sm", tone)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {progress.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            <p className="font-semibold text-foreground">{progress.stage}</p>
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">{progress.fileName}</p>
          <p className="mt-2 text-sm text-muted-foreground">{progress.detail}</p>
        </div>
        {progress.status !== "running" && (
          <Button type="button" variant="ghost" size="icon" onClick={onDismiss} aria-label="Dismiss upload progress">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full transition-all duration-300", progress.status === "error" ? "bg-destructive" : "bg-primary")} style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{percent}%</span>
        <span>{progress.current.toLocaleString()} / {progress.total.toLocaleString()}</span>
      </div>
    </div>
  );
};

const DocumentsTable = ({ rows, canAct, reload, onEdit, onPreview, onAudit }: { rows: DocumentRow[]; canAct: boolean; reload: () => Promise<void>; onEdit: (value: { type: "document"; id: string; title: string; context: string }) => void; onPreview: (doc: DocumentRow) => void; onAudit: () => void }) => (
  <DataTable headers={["Title + filename", "Type", "Pages", "Chunks", "Visibility", "Actions"]} empty="No documents yet.">
    {rows.map((row) => (
      <tr key={row.id} className="h-16 border-b border-border last:border-b-0">
        <td className="px-4"><div className="font-medium text-foreground">{row.title}</div><div className="text-xs text-muted-foreground">{row.source_filename}</div></td>
        <td className="px-4 text-center"><span className="rounded-md bg-secondary px-2 py-1 text-xs font-semibold uppercase text-secondary-foreground">{row.doc_type}</span></td>
        <td className="px-4 text-center text-foreground">{row.total_pages}</td>
        <td className="px-4 text-center text-foreground">{row.chunk_count ?? 0}</td>
        <td className="px-4 text-center">
          <VisibilityToggle publicAccess={row.is_public} canAct={canAct} entityLabel={row.title} onToggle={() => toggleEntityVisibility({ table: "documents", entityType: "document", id: row.id, name: row.title, nextValue: !row.is_public, reload, onAudit })} />
        </td>
        <td className="px-4"><div className="flex justify-center gap-1"><IconButton label="View document" onClick={() => onPreview(row)}><Eye className="h-4 w-4" /></IconButton>{canAct && <><IconButton label="Edit context" onClick={() => onEdit({ type: "document", id: row.id, title: row.title, context: row.ai_parsed_context || row.parser_summary || "" })}><Edit3 className="h-4 w-4" /></IconButton><IconButton label="Re-embed for semantic search" onClick={async () => { toast.info("Embedding chunks..."); try { const embedded = await embedEntityPaginated("document", row.id); toast.success(`Embedded ${embedded} chunks`); await writeAudit("CONTEXT_UPDATED" as AuditEventType, "document", row.id, row.title, { action: "re_embed", embedded }); onAudit(); } catch (e) { toast.error(e instanceof Error ? e.message : "Embedding failed"); } }}><Sparkles className="h-4 w-4" /></IconButton><IconButton label="Download document" onClick={() => downloadDocument(row, onAudit)}><Download className="h-4 w-4" /></IconButton><IconButton label="Refresh status" onClick={async () => { await writeAudit("DOCUMENT_SYNC_STATUS_REFRESHED", "document", row.id, row.title); onAudit(); toast.success("Document status refreshed"); }}><RefreshCw className="h-4 w-4" /></IconButton><IconButton label="Delete document" onClick={async () => { if (!window.confirm(`Delete document "${row.title}"? This permanently removes all its chunks and cannot be undone.`)) return; const { error } = await (supabase as any).from("documents").delete().eq("id", row.id); if (error) { toast.error(error.message); return; } await writeAudit("DOCUMENT_DELETED", "document", row.id, row.title); toast.success("Document deleted"); await reload(); onAudit(); }}><Trash2 className="h-4 w-4" /></IconButton></>}</div></td>
      </tr>
    ))}
  </DataTable>
);

type ColRow = { name: string; description: string };

// Parse a previously-saved context block back into per-column descriptions.
// Format we write: "## Column descriptions\n- name: description\n..."
const parseContextToColumns = (text: string, names: string[]): ColRow[] => {
  const map = new Map<string, string>();
  for (const line of (text ?? "").split("\n")) {
    const m = line.match(/^\s*[-*]\s*([^:]+?)\s*:\s*(.+)$/);
    if (m) map.set(m[1].trim(), m[2].trim());
  }
  return names.map((n) => ({ name: n, description: map.get(n) ?? "" }));
};

const serializeColumns = (rows: ColRow[]): string => {
  const body = rows.map((r) => `- ${r.name}: ${r.description.trim() || "(no description)"}`).join("\n");
  return `## Column descriptions\n${body}\n`;
};

const ContextEditor = ({ editing, onClose, onSaved }: { editing: { type: "dataset" | "document"; id: string; title: string; context: string } | null; onClose: () => void; onSaved: () => void }) => {
  const [value, setValue] = useState("");
  const [cols, setCols] = useState<ColRow[]>([]);
  const [loadingCols, setLoadingCols] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    setValue(editing?.context ?? "");
    setCols([]);
    if (!editing || editing.type !== "dataset") return;
    (async () => {
      setLoadingCols(true);
      try {
        const { data: col } = await (supabase as any).from("collections").select("columns_meta").eq("id", editing.id).maybeSingle();
        let names: string[] = [];
        const raw = col?.columns_meta;
        if (Array.isArray(raw)) {
          names = raw.map((c: any) => (typeof c === "string" ? c : c?.name)).filter(Boolean);
        }
        if (names.length === 0) {
          const { data: sample } = await (supabase as any).from("dataset_rows").select("data").eq("collection_id", editing.id).limit(20);
          const counts: Record<string, number> = {};
          for (const r of sample ?? []) for (const k of Object.keys(r?.data ?? {})) counts[k] = (counts[k] ?? 0) + 1;
          names = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k]) => k);
        }
        setCols(parseContextToColumns(editing.context ?? "", names));
      } finally { setLoadingCols(false); }
    })();
  }, [editing]);

  if (!editing) return null;

  const aiSuggest = async () => {
    if (cols.length === 0) return;
    setSuggesting(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke("suggest-column-descriptions", {
        body: { collection_id: editing.id, columns: cols.map((c) => c.name) },
      });
      if (error) throw error;
      const suggested: { name: string; description: string }[] = data?.descriptions ?? [];
      const map = new Map(suggested.map((s) => [s.name, s.description]));
      setCols((prev) => prev.map((c) => ({ ...c, description: map.get(c.name) ?? c.description })));
      toast.success("AI suggestions filled in — review and Save");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI suggestion failed");
    } finally { setSuggesting(false); }
  };

  const save = async () => {
    const table = editing.type === "dataset" ? "collections" : "documents";
    const payload = editing.type === "dataset" ? serializeColumns(cols) : value;
    const { error } = await (supabase as any).from(table).update({ ai_parsed_context: payload }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    await writeAudit("CONTEXT_UPDATED", editing.type, editing.id, editing.title, { context_length: payload.length });
    toast.success("Context saved");
    onClose();
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 px-4" role="dialog" aria-modal="true">
      <div className={cn("flex max-h-[90vh] w-full max-w-3xl flex-col border border-border bg-card p-6 shadow-lg", ADMIN_RADIUS)}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{editing.title}</h2>
            <p className="text-xs text-muted-foreground">{editing.type} ID: {editing.id}</p>
          </div>
          <IconButton label="Close" onClick={onClose}><X className="h-4 w-4" /></IconButton>
        </div>

        {editing.type === "dataset" ? (
          <>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Describe each column so the AI can answer questions accurately. Leave blank or click <strong>AI Suggest</strong>.</p>
              <Button size="sm" variant="outline" onClick={aiSuggest} disabled={suggesting || loadingCols || cols.length === 0}>
                {suggesting ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Suggesting…</> : <><Sparkles className="mr-1 h-3.5 w-3.5" />AI Suggest</>}
              </Button>
            </div>
            <div className="mt-3 flex-1 overflow-auto rounded-lg border border-border">
              {loadingCols ? (
                <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : cols.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No columns found for this dataset.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 text-left">
                    <tr><th className="w-1/3 px-3 py-2 font-medium">Column</th><th className="px-3 py-2 font-medium">Description</th></tr>
                  </thead>
                  <tbody>
                    {cols.map((c, idx) => (
                      <tr key={c.name} className="border-t border-border">
                        <td className="px-3 py-2 align-top font-mono text-xs text-foreground">{c.name}</td>
                        <td className="px-3 py-1.5">
                          <input
                            value={c.description}
                            onChange={(e) => setCols((prev) => prev.map((row, i) => i === idx ? { ...row, description: e.target.value } : row))}
                            placeholder="Short plain-English description…"
                            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Provide a context brief so the AI can answer questions accurately. Click <strong>AI Suggest</strong> to auto-generate from the document content.</p>
              <Button size="sm" variant="outline" onClick={async () => {
                setSuggesting(true);
                try {
                  const { data, error } = await (supabase as any).functions.invoke("suggest-document-context", { body: { document_id: editing.id } });
                  if (error) throw error;
                  const ctx: string = data?.context ?? "";
                  if (ctx) { setValue(ctx); toast.success("AI context filled in — review and Save"); }
                  else toast.warning("No context returned");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "AI suggestion failed");
                } finally { setSuggesting(false); }
              }} disabled={suggesting}>
                {suggesting ? <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />Suggesting…</> : <><Sparkles className="mr-1 h-3.5 w-3.5" />AI Suggest</>}
              </Button>
            </div>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-3 min-h-64 w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
            />
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save Context</Button>
        </div>
      </div>
    </div>
  );
};

const DocumentPreviewDialog = ({ document, onClose }: { document: DocumentRow | null; onClose: () => void }) => {
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!document?.storage_path) return setUrl(null);
    supabase.storage.from("documents").createSignedUrl(document.storage_path, 300).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [document]);
  if (!document) return null;
  const maxPage = Math.max(document.total_pages || 1, 1);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 px-4" role="dialog" aria-modal="true"><div className={cn("flex h-[86vh] w-full max-w-5xl flex-col border border-border bg-card shadow-lg", ADMIN_RADIUS)}><div className="flex items-center justify-between gap-3 border-b border-border p-3"><div className="min-w-0"><h2 className="truncate font-semibold text-foreground">{document.title}</h2><p className="truncate text-xs text-muted-foreground">{document.source_filename}</p></div><div className="flex shrink-0 items-center gap-1"><IconButton label="Zoom out" onClick={() => setZoom((z) => Math.max(60, z - 10))}><ZoomOut className="h-4 w-4" /></IconButton><span className="w-14 text-center text-xs text-muted-foreground">{zoom}%</span><IconButton label="Zoom in" onClick={() => setZoom((z) => Math.min(160, z + 10))}><ZoomIn className="h-4 w-4" /></IconButton><IconButton label="Close" onClick={onClose}><X className="h-4 w-4" /></IconButton></div></div><div className="flex items-center justify-between border-b border-border px-3 py-2 text-sm text-muted-foreground"><Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button><span>Page {page} of {maxPage}</span><Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(maxPage, p + 1))}>Next</Button></div><div className="flex-1 overflow-auto bg-muted p-4">{url && document.source_filename.toLowerCase().endsWith(".pdf") ? <iframe title={document.title} src={`${url}#page=${page}&zoom=${zoom}`} className="mx-auto h-full min-h-[620px] border border-border bg-background" style={{ width: `${zoom}%` }} /> : <div className="flex h-full items-center justify-center text-muted-foreground">Preview is available for PDF documents.</div>}</div></div></div>;
};

const DataTable = ({ headers, empty, children }: { headers: string[]; empty: string; children: React.ReactNode }) => <div className={cn("overflow-hidden border border-border bg-card shadow-sm", ADMIN_RADIUS)}><table className="w-full border-collapse text-sm"><thead><tr className="border-b border-border bg-card text-muted-foreground">{headers.map((h) => <th key={h} className="px-4 py-4 text-center font-semibold first:text-left">{h}</th>)}</tr></thead><tbody>{children || <tr><td colSpan={headers.length} className="px-4 py-10 text-center text-muted-foreground">{empty}</td></tr>}</tbody></table></div>;
const AccessBadge = ({ publicAccess }: { publicAccess: boolean }) => <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">{publicAccess ? "Public" : "Private"}</span>;
const IconButton = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => <button type="button" aria-label={label} title={label} onClick={onClick} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">{children}</button>;
const UserManagement = ({ users, onRoleChange, onSave }: { users: DashboardUser[]; onRoleChange: (id: string, role: Role) => void; onSave: () => void }) => <div className="space-y-4"><div className="space-y-4">{users.map((user) => <UserRow key={user.id} user={user} onRoleChange={onRoleChange} />)}</div><div className="flex justify-end"><Button onClick={onSave} className="min-w-36">Save Changes</Button></div></div>;
const KpiCard = ({ label, value }: KpiMetric) => <article className={cn("border border-border bg-card p-4 shadow-sm", ADMIN_RADIUS)}><p className="min-h-10 text-base leading-tight text-muted-foreground">{label}</p><p className="mt-1 text-center text-4xl font-medium tracking-normal text-foreground">{value}</p></article>;
const InsightCard = ({ label, value }: { label: string; value: string }) => <article className={cn("w-full max-w-xl border border-border bg-card p-4 shadow-sm", ADMIN_RADIUS)}><p className="text-base text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-medium leading-tight tracking-normal text-foreground md:text-4xl">{value}</p></article>;
const RoleCapabilitiesCard = ({ currentRole }: { currentRole: AppRole | null }) => {
  const rows = [
    { capability: "Collections and documents", admin: true, superAdmin: true, note: "Upload, curate, edit, re-embed, toggle visibility." },
    { capability: "Audit log", admin: true, superAdmin: true, note: "Track content and system actions." },
    { capability: "User Management", admin: false, superAdmin: true, note: "Promote or demote users and assign roles." },
    { capability: "Settings", admin: false, superAdmin: true, note: "Model access level, prompts, and rate limits." },
    { capability: "System-level controls", admin: false, superAdmin: true, note: "Admin-only app configuration." },
  ];

  return (
    <section className={cn("border border-border bg-card p-4 shadow-sm", ADMIN_RADIUS)} aria-labelledby="role-capabilities-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="role-capabilities-title" className="text-xl font-semibold text-foreground">Role capabilities</h2>
          <p className="mt-1 text-sm text-muted-foreground">Current role: <span className="font-semibold text-foreground">{roleLabel(currentRole)}</span>. Super Admin includes everything Admin can do, plus the controls below.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Permission reference
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-muted-foreground">
              <th className="px-4 py-3 text-left font-semibold">Capability</th>
              <th className="px-4 py-3 text-center font-semibold">Admin</th>
              <th className="px-4 py-3 text-center font-semibold">Super Admin</th>
              <th className="px-4 py-3 text-left font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.capability} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 font-medium text-foreground">{row.capability}</td>
                <td className="px-4 py-3 text-center">{row.admin ? <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Yes</span> : <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">No</span>}</td>
                <td className="px-4 py-3 text-center">{row.superAdmin ? <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">Yes</span> : <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">No</span>}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (value: T) => void; items: { value: T; label: string; icon: typeof Users }[] }) {
  return <div className="inline-flex items-center gap-1 rounded-xl bg-muted p-1" role="tablist">{items.map((item) => { const Icon = item.icon; const selected = value === item.value; return <button key={item.value} type="button" role="tab" aria-selected={selected} onClick={() => onChange(item.value)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-muted-foreground transition-colors", selected && "bg-card text-foreground shadow-sm")}><Icon className="h-4 w-4" />{item.label}</button>; })}</div>;
}
const UserRow = ({ user, onRoleChange }: { user: DashboardUser; onRoleChange: (id: string, role: Role) => void }) => <div className={cn("flex min-h-16 items-center justify-between gap-4 border border-border bg-card px-4 py-3 shadow-sm", ADMIN_RADIUS)}><div className="flex min-w-0 items-center gap-1 text-xl font-medium text-muted-foreground">{user.role === "Super Admin" ? <ShieldCheck className="h-5 w-5 shrink-0" /> : <User className="h-5 w-5 shrink-0" />}<span className="truncate">{user.name}</span></div><label className="relative shrink-0"><span className="sr-only">Role for {user.name}</span><select value={user.role} onChange={(event) => onRoleChange(user.id, event.target.value as Role)} className="h-9 min-w-36 appearance-none rounded-lg border border-border bg-background py-1 pl-3 pr-9 text-base font-medium text-muted-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/20"><option>Super Admin</option><option>Admin</option><option>User</option></select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /></label></div>;
const AuditLogTable = ({ rows }: { rows: AuditLogEntry[] }) => {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toTime = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const rowTime = new Date(row.createdAt).getTime();
      if (fromTime !== null && rowTime < fromTime) return false;
      if (toTime !== null && rowTime > toTime) return false;
      if (!q) return true;
      return [row.time, row.userName, row.action, row.entity].some((value) => String(value ?? "").toLowerCase().includes(q));
    });
  }, [from, query, rows, to]);

  const clearFilters = () => {
    setFrom("");
    setTo("");
    setQuery("");
  };

  return (
    <div className="space-y-3">
      <div className={cn("flex flex-wrap items-end gap-3 border border-border bg-card p-3 shadow-sm", ADMIN_RADIUS)}>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20" />
        </label>
        <label className="grid min-w-56 flex-1 gap-1 text-xs font-medium text-muted-foreground">
          Search
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="User, action, or entity" className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20" />
        </label>
        <Button type="button" variant="outline" onClick={clearFilters}>Clear</Button>
        <p className="ml-auto text-xs text-muted-foreground">{filtered.length.toLocaleString()} of {rows.length.toLocaleString()} events</p>
      </div>
      <DataTable headers={["Time", "User", "Action", "Entity"]} empty="No audit events match the selected filters.">
        {filtered.map((row) => (
          <tr key={row.id} className="h-14 border-b border-border last:border-b-0">
            <td className="px-4 text-center text-muted-foreground">{row.time}</td>
            <td className="px-4 text-center text-foreground">{row.userName}</td>
            <td className="px-4 text-center text-foreground">{row.action}</td>
            <td className="px-4 text-center text-foreground">{row.entity}</td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
};

async function embedEntityPaginated(entity_type: "dataset" | "document", id: string): Promise<number> {
  let offset = 0, embedded = 0;
  for (let i = 0; i < 1000; i++) {
    const { data, error } = await supabase.functions.invoke("embed-collection", { body: { entity_type, id, force: true, offset } });
    if (error) throw error;
    const d = data as any;
    embedded += d?.embedded ?? 0;
    if (d?.done || d?.next_offset == null) return embedded;
    offset = d.next_offset;
  }
  return embedded;
}

async function writeAudit(event_type: AuditEventType, entity_type: string, entity_id: string | null, entity_name: string, metadata: Record<string, unknown> = {}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { data: profile } = await supabase.from("profiles").select("id,email,full_name").eq("id", auth.user.id).maybeSingle();
  const actor = profile ? displayName(profile as ProfileRow) : auth.user.email?.split("@")[0] ?? "Authenticated user";
  const { error } = await (supabase as any).from("audit_logs").insert({ event_type, actor_user_id: auth.user.id, actor_display_name: actor, entity_type, entity_id, entity_name, metadata });
  return !error;
}
async function downloadDocument(doc: DocumentRow, onAudit: () => void) {
  if (!doc.storage_path) return toast.error("Document file is not available");
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60, { download: doc.source_filename });
  if (error || !data?.signedUrl) return toast.error(error?.message ?? "Download failed");
  await writeAudit("DOCUMENT_DOWNLOADED", "document", doc.id, doc.title, { filename: doc.source_filename });
  onAudit();
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
const currency = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

// ---------- Settings panel (Super Admin only) ----------

type AiSettingsRow = {
  chat_model: string;
  router_model: string;
  temperature: number;
  max_tokens: number;
  system_prompt_override: string | null;
  active_tier: string;
};
type RateLimitRow = { tier: string; requests_per_minute: number };

const TIER_ORDER = ["free", "pro", "business", "enterprise"] as const;
type Tier = typeof TIER_ORDER[number];
const tierRank = (t: string) => Math.max(0, TIER_ORDER.indexOf(t as Tier));

// Each model is gated to a minimum tier. Higher tiers inherit all lower-tier models.
type ModelOption = { value: string; label: string; minTier: Tier };

const CHAT_MODEL_OPTIONS: ModelOption[] = [
  { value: "gpt-4o-mini", label: "OpenAI · GPT-4o mini (faster, cheaper)", minTier: "free" },
  { value: "gpt-4o", label: "OpenAI · GPT-4o", minTier: "pro" },
  { value: "gpt-4.1-mini", label: "OpenAI · GPT-4.1 mini", minTier: "pro" },
  { value: "gpt-4-turbo", label: "OpenAI · GPT-4 Turbo", minTier: "business" },
  { value: "gpt-4.1", label: "OpenAI · GPT-4.1", minTier: "business" },
  { value: "gpt-5", label: "OpenAI · GPT-5", minTier: "enterprise" },
  { value: "gpt-5-pro", label: "OpenAI · GPT-5 Pro", minTier: "enterprise" },
];
const ROUTER_MODEL_OPTIONS: ModelOption[] = [
  { value: "gpt-4o-mini", label: "OpenAI · GPT-4o mini (default)", minTier: "free" },
  { value: "gpt-4o", label: "OpenAI · GPT-4o", minTier: "pro" },
  { value: "gpt-4.1-mini", label: "OpenAI · GPT-4.1 mini", minTier: "pro" },
];

const allowedFor = (opts: ModelOption[], tier: string) =>
  opts.filter((o) => tierRank(o.minTier) <= tierRank(tier));

const SettingsPanel = ({ onAudit }: { onAudit: () => void }) => {
  const [ai, setAi] = useState<AiSettingsRow | null>(null);
  const [rates, setRates] = useState<RateLimitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: aiData }, { data: rateData }] = await Promise.all([
      (supabase as any).from("ai_settings").select("chat_model,router_model,temperature,max_tokens,system_prompt_override,active_tier").eq("id", 1).maybeSingle(),
      supabase.from("rate_limit_config").select("tier,requests_per_minute").order("tier"),
    ]);
    setAi(aiData ?? { chat_model: "gpt-4o-mini", router_model: "gpt-4o-mini", temperature: 0.7, max_tokens: 4000, system_prompt_override: null, active_tier: "free" });
    setRates(rateData ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const saveAi = async () => {
    if (!ai) return;
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("ai_settings").update({ ...ai, updated_by: auth.user?.id }).eq("id", 1);
    setSaving(false);
    if (error) return toast.error(error.message);
    await writeAudit("CONTEXT_UPDATED" as AuditEventType, "ai_settings", null, "AI Settings", { chat_model: ai.chat_model, router_model: ai.router_model, temperature: ai.temperature, max_tokens: ai.max_tokens, active_tier: ai.active_tier });
    toast.success("AI settings saved");
    onAudit();
  };

  const saveRate = async (tier: string, rpm: number) => {
    const { error } = await supabase.from("rate_limit_config").update({ requests_per_minute: rpm }).eq("tier", tier);
    if (error) return toast.error(error.message);
    await writeAudit("CONTEXT_UPDATED" as AuditEventType, "rate_limit_config", null, `Rate limit: ${tier}`, { tier, requests_per_minute: rpm });
    toast.success(`Updated ${tier} rate limit`);
    onAudit();
  };

  if (loading || !ai) return <div className="mt-6 flex h-40 items-center justify-center border border-border bg-card"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  const chatOptions = allowedFor(CHAT_MODEL_OPTIONS, ai.active_tier);
  const routerOptions = allowedFor(ROUTER_MODEL_OPTIONS, ai.active_tier);

  const onTierChange = (newTier: string) => {
    const nextChat = allowedFor(CHAT_MODEL_OPTIONS, newTier);
    const nextRouter = allowedFor(ROUTER_MODEL_OPTIONS, newTier);
    setAi({
      ...ai,
      active_tier: newTier,
      chat_model: nextChat.some((o) => o.value === ai.chat_model) ? ai.chat_model : nextChat[0]?.value ?? ai.chat_model,
      router_model: nextRouter.some((o) => o.value === ai.router_model) ? ai.router_model : nextRouter[0]?.value ?? ai.router_model,
    });
  };

  return (
    <section className="mt-6 space-y-6" aria-labelledby="settings-title">
      <div>
        <h1 id="settings-title" className="text-4xl font-semibold tracking-normal text-foreground md:text-5xl">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Super-admin controls for the AI assistant and API rate limits.</p>
      </div>

      <Card className={cn("border-border", ADMIN_RADIUS)}>
        <CardHeader><CardTitle>AI Model Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Model access level</label>
            <select value={ai.active_tier} onChange={(e) => onTierChange(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20 md:w-72">
              {TIER_ORDER.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">Controls which OpenAI models admins can select for national-scale chatbot workloads.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Chat model</label>
              <select value={ai.chat_model} onChange={(e) => setAi({ ...ai, chat_model: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20">
                {chatOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">{chatOptions.length} of {CHAT_MODEL_OPTIONS.length} OpenAI models available for {ai.active_tier} access.</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Router model</label>
              <select value={ai.router_model} onChange={(e) => setAi({ ...ai, router_model: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20">
                {routerOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">Lightweight model used to pick relevant collections.</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Temperature ({ai.temperature.toFixed(2)})</label>
              <input type="range" min={0} max={1} step={0.05} value={ai.temperature} onChange={(e) => setAi({ ...ai, temperature: Number(e.target.value) })} className="w-full" />
              <p className="mt-1 text-xs text-muted-foreground">Higher = more creative. Lower = more deterministic.</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Max tokens per response</label>
              <input type="number" min={256} max={16000} step={100} value={ai.max_tokens} onChange={(e) => setAi({ ...ai, max_tokens: Number(e.target.value) })} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20" />
              <p className="mt-1 text-xs text-muted-foreground">Caps the assistant's reply length.</p>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">System prompt override <span className="font-normal text-muted-foreground">(optional)</span></label>
            <textarea value={ai.system_prompt_override ?? ""} onChange={(e) => setAi({ ...ai, system_prompt_override: e.target.value || null })} rows={5} placeholder="Leave blank to use the default ALAM system prompt." className="w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20" />
          </div>
          <div className="flex justify-end">
            <Button onClick={saveAi} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save AI settings</Button>
          </div>
        </CardContent>
      </Card>

      <Card className={cn("border-border", ADMIN_RADIUS)}>
        <CardHeader>
          <CardTitle>API Rate Limits</CardTitle>
          <p className="text-xs text-muted-foreground">Configure requests-per-minute per tier. Stored for future enforcement.</p>
        </CardHeader>
        <CardContent>
          {rates.length === 0 ? <p className="text-sm text-muted-foreground">No rate limit tiers configured.</p> : (
            <div className="space-y-3">
              {rates.map((r) => <RateLimitRow key={r.tier} row={r} onSave={saveRate} />)}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
};

const RateLimitRow = ({ row, onSave }: { row: RateLimitRow; onSave: (tier: string, rpm: number) => Promise<unknown> }) => {
  const [rpm, setRpm] = useState(row.requests_per_minute);
  return (
    <div className={cn("flex items-center justify-between gap-4 border border-border bg-card px-4 py-3", ADMIN_RADIUS)}>
      <div className="min-w-0">
        <p className="text-sm font-semibold capitalize text-foreground">{row.tier}</p>
        <p className="text-xs text-muted-foreground">Requests per minute</p>
      </div>
      <div className="flex items-center gap-2">
        <input type="number" min={1} max={10000} value={rpm} onChange={(e) => setRpm(Number(e.target.value))} className="h-9 w-28 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20" />
        <Button size="sm" variant="outline" onClick={() => onSave(row.tier, rpm)} disabled={rpm === row.requests_per_minute}>Save</Button>
      </div>
    </div>
  );
};

export default Admin;
