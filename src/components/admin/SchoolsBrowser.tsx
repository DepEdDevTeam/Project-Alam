import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Loader2, Plus, Trash2, Search, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

type School = {
  school_id: string;
  school_name: string | null;
  region: string | null;
  division: string | null;
  municipality: string | null;
  sector: string | null;
};

const PAGE_SIZE = 50;

const FIELDS: { key: keyof School | "district" | "province" | "barangay" | "school_management" | "school_subclassification" | "street_address"; label: string; required?: boolean }[] = [
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
];

export const SchoolsBrowser = ({ onChange }: { onChange?: () => void }) => {
  const [rows, setRows] = useState<School[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("");
  const [regions, setRegions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [bulkConfirm, setBulkConfirm] = useState("");
  const [nuking, setNuking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("schools")
      .select("school_id,school_name,region,division,municipality,sector", { count: "exact" })
      .order("school_id")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (search.trim()) {
      const s = search.trim();
      q = q.or(`school_id.ilike.%${s}%,school_name.ilike.%${s}%`);
    }
    if (region) q = q.eq("region", region);
    const { data, count, error } = await q;
    if (error) toast.error(error.message);
    setRows((data ?? []) as School[]);
    setTotal(count ?? 0);
    setLoading(false);
  }, [page, search, region]);

  const loadRegions = useCallback(async () => {
    const { data } = await supabase.from("schools").select("region").not("region", "is", null).limit(1000);
    const uniq = Array.from(new Set((data ?? []).map((r: any) => r.region).filter(Boolean))).sort();
    setRegions(uniq);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadRegions(); }, [loadRegions]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const deleteOne = async (id: string) => {
    const { error } = await supabase.from("schools").delete().eq("school_id", id);
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${id}`);
    load(); onChange?.();
  };

  const addSchool = async () => {
    if (!form.school_id?.trim()) return toast.error("School ID is required");
    setSaving(true);
    const payload: any = {};
    for (const f of FIELDS) {
      const v = form[f.key as string]?.trim();
      if (v) payload[f.key] = v;
    }
    const { error } = await supabase.from("schools").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("School added");
    setAddOpen(false);
    setForm({});
    load(); onChange?.();
  };

  const deleteAll = async () => {
    setNuking(true);
    // delete via filter that matches all (school_id is text NOT NULL)
    const { error } = await supabase.from("schools").delete().not("school_id", "is", null);
    setNuking(false);
    if (error) return toast.error(error.message);
    toast.success("All schools deleted");
    setBulkConfirm("");
    setPage(0);
    load(); onChange?.();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle>Schools browser</CardTitle>
          <div className="flex items-center gap-2">
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Add school</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Add new school</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  {FIELDS.map((f) => (
                    <div key={f.key as string} className="space-y-1">
                      <Label className="text-xs">
                        {f.label}{f.required && <span className="text-destructive ml-1">*</span>}
                      </Label>
                      <Input
                        value={form[f.key as string] ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, [f.key as string]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
                  <Button onClick={addSchool} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive"><Trash2 className="h-4 w-4 mr-2" /> Delete all</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" /> Delete every school?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes <strong>{total.toLocaleString()}</strong> schools. Type <code className="px-1 bg-muted rounded">DELETE</code> to confirm.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input value={bulkConfirm} onChange={(e) => setBulkConfirm(e.target.value)} placeholder="DELETE" />
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setBulkConfirm("")}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={bulkConfirm !== "DELETE" || nuking}
                    onClick={(e) => { e.preventDefault(); deleteAll(); }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {nuking && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Delete all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setPage(0); setSearch(e.target.value); }}
              placeholder="Search by school ID or name…"
              className="pl-9"
            />
          </div>
          <select
            value={region}
            onChange={(e) => { setPage(0); setRegion(e.target.value); }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-[180px]"
          >
            <option value="">All regions</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <div className="border border-border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">School ID</TableHead>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Region</TableHead>
                <TableHead className="text-xs">Division</TableHead>
                <TableHead className="text-xs">Municipality</TableHead>
                <TableHead className="text-xs">Sector</TableHead>
                <TableHead className="text-xs w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">No schools found</TableCell></TableRow>
              )}
              {!loading && rows.map((r) => (
                <TableRow key={r.school_id}>
                  <TableCell className="font-mono text-xs">{r.school_id}</TableCell>
                  <TableCell className="text-xs max-w-[260px] truncate">{r.school_name}</TableCell>
                  <TableCell className="text-xs">{r.region}</TableCell>
                  <TableCell className="text-xs">{r.division}</TableCell>
                  <TableCell className="text-xs">{r.municipality}</TableCell>
                  <TableCell className="text-xs">{r.sector}</TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this school?</AlertDialogTitle>
                          <AlertDialogDescription>
                            <strong>{r.school_id}</strong> — {r.school_name ?? "(no name)"}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteOne(r.school_id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            {total.toLocaleString()} total · page {page + 1} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
