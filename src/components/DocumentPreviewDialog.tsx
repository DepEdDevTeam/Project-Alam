import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, Download, Loader2, FileText, AlertCircle } from "lucide-react";

export type PreviewDoc = {
  id: string;
  title: string;
  doc_type?: string;
  total_pages?: number;
  storage_path?: string | null;
  source_filename?: string;
};

type Props = {
  doc: PreviewDoc | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const getExt = (name?: string | null) => (name?.split(".").pop() || "").toLowerCase();

export const DocumentPreviewDialog = ({ doc, open, onOpenChange }: Props) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !doc) {
      setSignedUrl(null);
      setError(null);
      return;
    }
    if (!doc.storage_path) {
      setError("Original file not available — re-upload this document to enable preview.");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.storage_path!, 60 * 60);
      if (cancelled) return;
      setLoading(false);
      if (err || !data?.signedUrl) {
        setError(err?.message ?? "Failed to load preview.");
        return;
      }
      setSignedUrl(data.signedUrl);
    })();
    return () => { cancelled = true; };
  }, [open, doc]);

  const ext = getExt(doc?.source_filename);
  const isPdf = ext === "pdf";
  const isDocx = ext === "docx" || ext === "doc";

  const officeUrl =
    signedUrl && isDocx
      ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrl)}`
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 border-b border-border space-y-1">
          <DialogTitle className="flex items-center gap-2 pr-8">
            <FileText className="h-4 w-4 text-secondary shrink-0" />
            <span className="truncate">{doc?.title ?? "Document"}</span>
          </DialogTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {doc?.doc_type && <span className="capitalize">{doc.doc_type}</span>}
            {doc?.total_pages ? <span>· {doc.total_pages} page(s)</span> : null}
            {doc?.source_filename && <span className="font-mono truncate">· {doc.source_filename}</span>}
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!signedUrl}
              onClick={() => signedUrl && window.open(signedUrl, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open in new tab
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!signedUrl}
              asChild={!!signedUrl}
            >
              {signedUrl ? (
                <a href={signedUrl} download={doc?.source_filename ?? doc?.title}>
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              ) : (
                <span><Download className="h-3.5 w-3.5" /> Download</span>
              )}
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-muted/30">
          {loading && (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {error && !loading && (
            <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
              <AlertCircle className="h-10 w-10 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground max-w-md">{error}</p>
            </div>
          )}
          {!loading && !error && signedUrl && (
            <>
              {isPdf && (
                <iframe
                  src={signedUrl}
                  title={doc?.title}
                  className="w-full h-full border-0"
                />
              )}
              {isDocx && officeUrl && (
                <iframe
                  src={officeUrl}
                  title={doc?.title}
                  className="w-full h-full border-0"
                />
              )}
              {!isPdf && !isDocx && (
                <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground/60" />
                  <p className="text-sm text-muted-foreground">
                    Preview not supported for this file type. Use "Open in new tab" or "Download" instead.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
