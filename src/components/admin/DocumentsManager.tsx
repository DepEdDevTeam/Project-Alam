import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Trash2, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DocumentPreviewDialog, type PreviewDoc } from "@/components/DocumentPreviewDialog";

type DocRow = {
  id: string;
  title: string;
  source_filename: string;
  doc_type: string;
  total_pages: number;
  is_public: boolean;
  created_at: string;
  storage_path: string | null;
};

type DocWithCount = DocRow & { chunk_count: number };

export const DocumentsManager = () => {
  const [docs, setDocs] = useState<DocWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewDoc, setPreviewDoc] = useState<PreviewDoc | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: docsData } = await supabase
      .from("documents")
      .select("id,title,source_filename,doc_type,total_pages,is_public,created_at,storage_path")
      .order("created_at", { ascending: false });

    const ids = (docsData ?? []).map((d) => d.id);
    const counts: Record<string, number> = {};
    if (ids.length > 0) {
      // Fetch chunk counts per document
      for (const id of ids) {
        const { count } = await supabase
          .from("document_chunks")
          .select("*", { count: "exact", head: true })
          .eq("document_id", id);
        counts[id] = count ?? 0;
      }
    }
    setDocs((docsData ?? []).map((d) => ({ ...d, chunk_count: counts[d.id] ?? 0 })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const togglePublic = async (d: DocRow) => {
    await supabase.from("documents").update({ is_public: !d.is_public }).eq("id", d.id);
    load();
  };

  const remove = async (d: DocRow) => {
    if (!confirm(`Delete "${d.title}" and all its chunks?`)) return;
    const { error } = await supabase.from("documents").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    toast.success("Document deleted");
    load();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (docs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          No documents yet. Upload a PDF or Word file in the <strong>Upload</strong> tab.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>{docs.length} document{docs.length !== 1 ? "s" : ""}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Pages</TableHead>
              <TableHead>Chunks</TableHead>
              <TableHead>Visibility</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <button
                    onClick={() => setPreviewDoc(d)}
                    className="font-medium text-left hover:text-primary hover:underline transition-colors"
                    title={d.storage_path ? "Preview document" : "Original file not available — re-upload to enable preview"}
                  >
                    {d.title}
                  </button>
                  <div className="text-xs text-muted-foreground font-mono">{d.source_filename}</div>
                </TableCell>
                <TableCell><span className="capitalize text-xs px-2 py-0.5 rounded-full bg-muted">{d.doc_type}</span></TableCell>
                <TableCell>{d.total_pages || "—"}</TableCell>
                <TableCell>{d.chunk_count.toLocaleString()}</TableCell>
                <TableCell>
                  <button onClick={() => togglePublic(d)} className="inline-flex items-center gap-1.5 text-xs">
                    {d.is_public ? <Eye className="h-3.5 w-3.5 text-green-600" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                    {d.is_public ? "Public" : "Private"}
                  </button>
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => setPreviewDoc(d)} title="Preview">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(d)} title="Delete">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    <DocumentPreviewDialog
      doc={previewDoc}
      open={!!previewDoc}
      onOpenChange={(o) => { if (!o) setPreviewDoc(null); }}
    />
    </>
  );
};
