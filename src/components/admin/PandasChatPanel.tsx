import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { FileSpreadsheet, Loader2, Send, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ChatMessage =
  | { role: "user"; content: string; files: string[] }
  | { role: "assistant"; content: string; frames?: string[] }
  | { role: "error"; content: string };

const ACCEPT = ".csv,.xlsx";

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

export const PandasChatPanel = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming).filter((f) => /\.(csv|xlsx)$/i.test(f.name));
    if (!list.length) {
      toast.error("Only .csv or .xlsx files are supported");
      return;
    }
    setFiles((prev) => {
      const map = new Map(prev.map((f) => [`${f.name}-${f.size}`, f]));
      for (const f of list) map.set(`${f.name}-${f.size}`, f);
      return Array.from(map.values());
    });
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const send = async () => {
    const q = question.trim();
    if (!q) {
      toast.error("Type a question first");
      return;
    }
    if (!files.length) {
      toast.error("Upload at least one CSV or XLSX file");
      return;
    }
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: q, files: files.map((f) => f.name) }]);
    setQuestion("");

    try {
      const formData = new FormData();
      formData.append("question", q);
      for (const f of files) formData.append("files", f, f.name);

      const { data, error } = await supabase.functions.invoke("pandas-chat", { body: formData });
      if (error) throw error;
      const answer = (data as { answer?: string; frames?: string[] })?.answer ?? "(no answer)";
      const frames = (data as { frames?: string[] })?.frames;
      setMessages((prev) => [...prev, { role: "assistant", content: answer, frames }]);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setMessages((prev) => [...prev, { role: "error", content: msg }]);
      toast.error("Pandas agent error", { description: msg });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="mt-4 rounded-xl border-border shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-xl">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Ad-hoc CSV / Excel Chat
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Upload one or more CSV files (or a multi-sheet XLSX) and ask questions in plain English or Filipino.
          A LangChain Pandas Agent runs the actual analysis — the raw rows never enter the LLM prompt.
          Files are processed in memory and are not saved.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          }}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 p-6 text-center"
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Drag &amp; drop .csv or .xlsx files here</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            Browse files
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {files.length > 0 && (
          <ul className="space-y-1.5">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2 truncate">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  <span className="truncate">{f.name}</span>
                  <span className="text-xs text-muted-foreground">({formatBytes(f.size)})</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. How many schools per region? Or: Merge df1 and df2 on school_id and show top 10 by enrollment."
            rows={3}
            className="resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">⌘/Ctrl + Enter to send</p>
            <Button type="button" onClick={send} disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Ask the agent
                </>
              )}
            </Button>
          </div>
        </div>

        {messages.length > 0 && (
          <div className="space-y-3 border-t border-border pt-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-xl border px-4 py-3 text-sm",
                  m.role === "user" && "border-border bg-muted/40",
                  m.role === "assistant" && "border-primary/30 bg-primary/5",
                  m.role === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
                )}
              >
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {m.role === "user" ? "You" : m.role === "assistant" ? "Pandas Agent" : "Error"}
                </div>
                {m.role === "user" ? (
                  <>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.files.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Files: {m.files.join(", ")}
                      </p>
                    )}
                  </>
                ) : m.role === "assistant" ? (
                  <>
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                    {m.frames && m.frames.length > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        DataFrames analyzed: {m.frames.join(", ")}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PandasChatPanel;
