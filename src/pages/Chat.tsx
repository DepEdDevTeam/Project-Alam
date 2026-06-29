import { useState, useEffect, useRef, useCallback, useMemo, forwardRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Square, Copy, Sparkles, Database, Loader2, LogIn, Plus, Pin, Trash2, Search, Menu, MessageSquare, ChevronLeft, LogOut, Shield, User as UserIcon, FileText, Quote, Download, Moon, Sun, BadgeCheck, BookOpenCheck, AlertTriangle, Info, Mic, MicOff, PhoneOff, Volume2, PanelLeftOpen,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Maximize2 } from "lucide-react";
import ChartBlock, { type ChartSpec } from "@/components/chat/ChartBlock";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Logo";
import { DocumentPreviewDialog, type PreviewDoc } from "@/components/DocumentPreviewDialog";
import { useThemeMode } from "@/hooks/useThemeMode";
import depedLogo from "@/assets/deped-logo.png";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Msg = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  citations?: { collection: string; record_count: number; total?: number }[];
  thinking?: string[];
};

type Conversation = {
  id: string;
  title: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

type Collection = { id: string; name: string; slug: string; row_count: number; description: string | null };
type DocItem = { id: string; title: string; doc_type: string; total_pages: number; storage_path: string | null; source_filename: string };
type SmartSuggestion = { category: string; prompt: string };
type VoiceStatus = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "muted" | "error";
type ChatScope =
  | { type: "all" }
  | { type: "dataset"; slug: string }
  | { type: "documents" };

const FALLBACK_SUGGESTIONS: SmartSuggestion[] = [
  { category: "Discover", prompt: "What datasets and documents are available right now?" },
  { category: "Summarize", prompt: "Summarize the available uploaded files." },
  { category: "Explore", prompt: "What kinds of questions can I ask based on the uploaded data?" },
  { category: "Audit", prompt: "Audit the available files for possible data quality issues." },
];

const makeSmartSuggestions = (collections: Collection[], documents: DocItem[]) => {
  const dataset = collections[0];
  const secondDataset = collections[1];
  const document = documents[0];
  const suggestions: SmartSuggestion[] = [];

  if (dataset) {
    suggestions.push({ category: "Summarize", prompt: `Summarize the "${dataset.name}" dataset and list its key columns.` });
    suggestions.push({ category: "Audit", prompt: `Audit "${dataset.name}" for missing values, unusual columns, and data quality issues.` });
  }

  if (dataset && dataset.row_count > 0) {
    suggestions.push({ category: "Analyze", prompt: `Find the most important patterns in "${dataset.name}" across all ${dataset.row_count.toLocaleString()} rows.` });
  }

  if (secondDataset) {
    suggestions.push({ category: "Compare", prompt: `Compare "${dataset.name}" with "${secondDataset.name}" and identify related fields or trends.` });
  }

  if (document) {
    suggestions.push({ category: "Document", prompt: `Summarize the document "${document.title}" and list key action items.` });
  }

  if (dataset && document) {
    suggestions.push({ category: "Cross-file", prompt: `Use "${dataset.name}" and "${document.title}" together. What insights or related topics can you find?` });
  }

  return [...suggestions, ...FALLBACK_SUGGESTIONS].slice(0, 4);
};

const isCasualPrompt = (text: string) => {
  const normalized = text.toLowerCase().replace(/[!?.,'"]/g, "").replace(/\s+/g, " ").trim();
  return normalized.length <= 60 && /^(hi|hello|hey|hello there|good morning|good afternoon|good evening|morning|kumusta|kamusta|salamat|thank you|thanks|thank you alam|thanks alam|ok|okay|nice|great|test)$/i.test(normalized);
};

const normalizeMathText = (text: string) => text
  .replace(/\\\[/g, "\n")
  .replace(/\\\]/g, "\n")
  .replace(/\\\(/g, "")
  .replace(/\\\)/g, "")
  .replace(/\\text\{([^{}]+)\}/g, "$1")
  .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1 / $2)")
  .replace(/\\left|\\right/g, "")
  .replace(/\\times/g, "x")
  .replace(/\\approx/g, "approximately")
  .replace(/\\,/g, " ")
  .replace(/[ \t]+\n/g, "\n")
  .replace(/\n{3,}/g, "\n\n");

const Chat = () => {
  const { user, isAdmin, signOut } = useAuth();
  const { theme, toggleTheme } = useThemeMode();
  const nav = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState<string[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("alam_chat_sidebar_open");
    return saved === null ? true : saved === "true";
  });
  const [scope, setScope] = useState<ChatScope>(() => {
    if (typeof window === "undefined") return { type: "all" };
    try {
      const saved = JSON.parse(localStorage.getItem("alam_chat_scope_new") || "null");
      if (saved?.type === "dataset" && typeof saved.slug === "string") return saved;
      if (saved?.type === "documents") return saved;
    } catch {}
    return { type: "all" };
  });
  const [citationFormat, setCitationFormat] = useState<"short" | "detailed">(
    () => (typeof window !== "undefined" && localStorage.getItem("alam_citation_format") === "detailed" ? "detailed" : "short"),
  );
  const [previewDoc, setPreviewDoc] = useState<PreviewDoc | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceMuted, setVoiceMuted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceAssistantDraftRef = useRef("");
  const messagesRef = useRef<Msg[]>([]);
  const scopeRef = useRef<ChatScope>(scope);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { scopeRef.current = scope; }, [scope]);

  const toggleCitationFormat = () => {
    setCitationFormat((prev) => {
      const next = prev === "short" ? "detailed" : "short";
      try { localStorage.setItem("alam_citation_format", next); } catch {}
      toast.success(`Citations: ${next === "detailed" ? "Detailed (with snippets)" : "Short (title + pages)"}`);
      return next;
    });
  };

  useEffect(() => {
    try {
      localStorage.setItem("alam_chat_sidebar_open", String(sidebarOpen));
    } catch {}
  }, [sidebarOpen]);

  // Load collections + documents (admins can also browse private sources)
  useEffect(() => {
    let collectionsQuery = supabase.from("collections").select("id,name,slug,row_count,description");
    let documentsQuery = supabase.from("documents").select("id,title,doc_type,total_pages,storage_path,source_filename").order("created_at", { ascending: false });
    if (!isAdmin) {
      collectionsQuery = collectionsQuery.eq("is_public", true);
      documentsQuery = documentsQuery.eq("is_public", true);
    }
    collectionsQuery.then(({ data }) => setCollections(data ?? []));
    documentsQuery.then(({ data }) => setDocuments(data ?? []));
  }, [isAdmin]);

  useEffect(() => {
    if (scope.type === "dataset" && collections.length > 0 && !collections.some((c) => c.slug === scope.slug)) {
      setScope({ type: "all" });
    }
  }, [collections, scope]);

  useEffect(() => {
    try {
      const key = activeConv ? `alam_chat_scope:${activeConv}` : "alam_chat_scope_new";
      localStorage.setItem(key, JSON.stringify(scope));
    } catch {}
  }, [scope, activeConv]);

  // Load conversations (authed only)
  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("conversations")
      .select("id,title,pinned,created_at,updated_at")
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    setConversations(data ?? []);
  }, [user]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const loadMessages = useCallback(async (cid: string) => {
    const { data } = await supabase
      .from("messages")
      .select("id,role,content,citations")
      .eq("conversation_id", cid)
      .order("created_at");
    setMessages((data ?? []).map((m: any) => ({ ...m, role: m.role as "user" | "assistant" })));
    setActiveConv(cid);
    try {
      const saved = JSON.parse(localStorage.getItem(`alam_chat_scope:${cid}`) || "null");
      if (saved?.type === "dataset" && typeof saved.slug === "string") setScope(saved);
      else if (saved?.type === "documents") setScope(saved);
      else setScope({ type: "all" });
    } catch { setScope({ type: "all" }); }
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const newChat = () => {
    setMessages([]);
    setActiveConv(null);
    setThinking([]);
    try {
      const saved = JSON.parse(localStorage.getItem("alam_chat_scope_new") || "null");
      setScope(saved?.type ? saved : { type: "all" });
    } catch { setScope({ type: "all" }); }
  };

  const exportReport = () => {
    if (messages.length === 0) return;
    const title = activeConv ? conversations.find((c) => c.id === activeConv)?.title : "ALAM conversation";
    const body = messages.map((m) => `## ${m.role === "user" ? "Question" : "ALAM Answer"}\n\n${m.content}`).join("\n\n---\n\n");
    const blob = new Blob([`# ${title || "ALAM conversation"}\n\nGenerated ${new Date().toLocaleString()}\n\n${body}\n`], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `alam-report-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Conversation report downloaded");
  };

  const persistConversation = async (firstUserMessage: string): Promise<string | null> => {
    if (!user) return null;
    if (activeConv) return activeConv;
    const title = firstUserMessage.slice(0, 60);
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title })
      .select("id")
      .single();
    if (error || !data) return null;
    setActiveConv(data.id);
    loadConversations();
    return data.id;
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streaming || inFlightRef.current) return;
    inFlightRef.current = true;
    setInput("");
    setStreaming(true);
    setThinking([]);

    const userMsg: Msg = { role: "user", content };
    setMessages((p) => [...p, userMsg]);

    const cid = await persistConversation(content);
    if (cid) {
      await supabase.from("messages").insert({ conversation_id: cid, role: "user", content });
    }

    const ac = new AbortController();
    abortRef.current = ac;
    let assistantText = "";
    const citations: Msg["citations"] = [];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      const resp = await fetch(url, {
        method: "POST",
        signal: ac.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          conversation_id: cid,
          citation_format: citationFormat,
          scope,
        }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) toast.error("Rate limit exceeded. Please slow down.");
        else if (resp.status === 402) toast.error("AI credits exhausted. Please add funds in Workspace settings.");
        else toast.error(`Chat error (${resp.status})`);
        throw new Error("stream-failed");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      // Initial thinking step
      setThinking([isCasualPrompt(content) ? "Preparing a quick reply..." : scope.type === "documents" ? "Searching documents..." : scope.type === "dataset" ? "Searching selected dataset..." : "Searching datasets and documents..."]);

      while (!done) {
        const { value, done: d } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            // Custom events from our function
            if (parsed._thinking) {
              setThinking((p) => [...p, parsed._thinking]);
              continue;
            }
            if (parsed._citation) {
              citations.push(parsed._citation);
              continue;
            }
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              assistantText += delta;
              setMessages((p) => {
                const last = p[p.length - 1];
                if (last?.role === "assistant") {
                  return p.map((m, i) => (i === p.length - 1 ? { ...m, content: assistantText, citations } : m));
                }
                return [...p, { role: "assistant", content: assistantText, citations }];
              });
            }
          } catch {
            buf = line + "\n" + buf;
            break;
          }
        }
      }

      if (cid && assistantText) {
        await supabase.from("messages").insert({
          conversation_id: cid,
          role: "assistant",
          content: assistantText,
          citations: citations as any,
        });
        await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", cid);
        loadConversations();
      }
    } catch (e: any) {
      if (e.name !== "AbortError" && e.message !== "stream-failed") console.error(e);
    } finally {
      setStreaming(false);
      setThinking([]);
      inFlightRef.current = false;
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  const queryAlamForVoice = useCallback(async (question: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        messages: [...messagesRef.current, { role: "user", content: question }].map((m) => ({ role: m.role, content: m.content })),
        citation_format: citationFormat,
        scope: scopeRef.current,
      }),
    });
    if (!resp.ok || !resp.body) throw new Error(`ALAM query failed (${resp.status})`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let answer = "";
    const citations: Msg["citations"] = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        let line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") break;
        try {
          const parsed = JSON.parse(json);
          if (parsed._citation) citations.push(parsed._citation);
          const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (delta) answer += delta;
        } catch {}
      }
    }

    if (answer) {
      setMessages((p) => [...p, { role: "assistant", content: answer, citations }]);
    }
    return answer || "I could not get a dataset answer from ALAM right now.";
  }, [citationFormat]);

  const endVoiceMode = useCallback(() => {
    dcRef.current?.close();
    pcRef.current?.close();
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.remove();
    }
    dcRef.current = null;
    pcRef.current = null;
    micStreamRef.current = null;
    remoteAudioRef.current = null;
    voiceAssistantDraftRef.current = "";
    setVoiceStatus("idle");
    setVoiceMuted(false);
  }, []);

  const toggleVoiceMute = () => {
    const next = !voiceMuted;
    micStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setVoiceMuted(next);
    setVoiceStatus(next ? "muted" : "listening");
  };

  const startVoiceMode = useCallback(async () => {
    if (voiceStatus !== "idle" && voiceStatus !== "error") return;
    const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    if (!window.isSecureContext && !isLocalhost) {
      const localhostUrl = `${window.location.protocol}//localhost:${window.location.port || "8080"}${window.location.pathname}${window.location.search}`;
      toast.error("Microphone needs localhost or HTTPS.", {
        description: `Current address (${window.location.hostname}) is not a secure browser origin.`,
        action: {
          label: "Open localhost",
          onClick: () => { window.location.href = localhostUrl; },
        },
      });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Microphone access is not available.", {
        description: "Use Chrome/Edge on http://localhost:8080 or deploy the app over HTTPS.",
      });
      return;
    }

    setVoiceStatus("connecting");
    setVoiceTranscript("");
    voiceAssistantDraftRef.current = "";

    try {
      const { data, error } = await supabase.functions.invoke("realtime-session", { body: {} });
      if (error) throw error;
      const ephemeralKey = data?.value ?? data?.client_secret?.value;
      if (!ephemeralKey) throw new Error("Realtime session did not return a client secret.");

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      remoteAudioRef.current = audioEl;
      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0];
      };

      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = micStream;
      micStream.getAudioTracks().forEach((track) => pc.addTrack(track, micStream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.addEventListener("open", () => {
        setVoiceStatus("listening");
        toast.success("Voice Mode is ready.");
      });
      dc.addEventListener("message", async (event) => {
        let payload: any;
        try { payload = JSON.parse(event.data); } catch { return; }

        if (payload.type === "input_audio_buffer.speech_started") setVoiceStatus("listening");
        if (payload.type === "input_audio_buffer.speech_stopped") setVoiceStatus("thinking");
        if (payload.type === "response.audio.delta") setVoiceStatus("speaking");
        if (payload.type === "response.done") setVoiceStatus(voiceMuted ? "muted" : "listening");

        const transcript = payload.transcript ?? payload.delta ?? payload.text;
        if (payload.type?.includes("transcription") && typeof transcript === "string") {
          setVoiceTranscript(transcript);
          if (payload.type.endsWith(".completed") && transcript.trim()) {
            setMessages((p) => [...p, { role: "user", content: transcript.trim() }]);
          }
        }

        if (payload.type === "response.audio_transcript.delta" && typeof payload.delta === "string") {
          voiceAssistantDraftRef.current += payload.delta;
        }
        if (payload.type === "response.audio_transcript.done" && voiceAssistantDraftRef.current.trim()) {
          const spoken = voiceAssistantDraftRef.current.trim();
          voiceAssistantDraftRef.current = "";
          setMessages((p) => [...p, { role: "assistant", content: spoken }]);
        }

        const item = payload.item;
        if (payload.type === "response.output_item.done" && item?.type === "function_call" && item.name === "query_alam") {
          setVoiceStatus("thinking");
          let question = "";
          try { question = JSON.parse(item.arguments || "{}").question || ""; } catch {}
          const answer = await queryAlamForVoice(question || voiceTranscript || "Answer the user's latest question.");
          dc.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: item.call_id,
              output: JSON.stringify({ answer }),
            },
          }));
          dc.send(JSON.stringify({ type: "response.create" }));
        }

        if (payload.type === "error") {
          console.error("Realtime error", payload);
          setVoiceStatus("error");
          toast.error(payload.error?.message ?? "Voice Mode error");
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpResponse.ok) {
        throw new Error(await sdpResponse.text());
      }
      await pc.setRemoteDescription({ type: "answer", sdp: await sdpResponse.text() });
    } catch (error: any) {
      console.error(error);
      endVoiceMode();
      setVoiceStatus("error");
      toast.error(error?.message || "Could not start Voice Mode.");
    }
  }, [endVoiceMode, queryAlamForVoice, voiceMuted, voiceStatus, voiceTranscript]);

  useEffect(() => () => endVoiceMode(), [endVoiceMode]);

  const deleteConv = async (id: string) => {
    await supabase.from("conversations").delete().eq("id", id);
    if (activeConv === id) newChat();
    loadConversations();
  };

  const togglePin = async (c: Conversation) => {
    await supabase.from("conversations").update({ pinned: !c.pinned }).eq("id", c.id);
    loadConversations();
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const formatConversationDate = (value: string) => {
    const date = new Date(value);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const day = date.getTime();
    if (day >= startOfToday) return `Created today, ${time}`;
    if (day >= startOfYesterday) return `Created yesterday, ${time}`;
    return `Created ${date.toLocaleDateString([], { month: "short", day: "numeric", year: now.getFullYear() === date.getFullYear() ? undefined : "numeric" })}`;
  };

  const filteredConv = conversations.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()));

  const Sidebar = (
    <aside className="h-full flex flex-col bg-sidebar text-sidebar-foreground w-72">
      <div className="p-4 flex items-center justify-between border-b border-sidebar-border">
        <Logo variant="light" />
      </div>

      <div className="p-3 space-y-2">
        <Button onClick={newChat} className="w-full justify-start gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90 font-semibold">
          <Plus className="h-4 w-4" /> New chat
        </Button>
        {user && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-sidebar-foreground/50" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="pl-9 h-9 bg-sidebar-accent border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/50"
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-2 space-y-1">
        {!user && (
          <div className="px-3 py-6 text-center text-sm text-sidebar-foreground/60">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Sign in to save conversations.
            <Link to="/auth"><Button size="sm" className="mt-3 w-full"><LogIn className="h-3 w-3 mr-1" /> Sign in</Button></Link>
          </div>
        )}
        {filteredConv.map((c) => (
          <div
            key={c.id}
            onClick={() => loadMessages(c.id)}
            className={cn(
              "group px-3 py-2.5 rounded-lg cursor-pointer text-sm transition flex items-start gap-2",
              activeConv === c.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"
            )}
          >
            {c.pinned && <Pin className="mt-0.5 h-3 w-3 text-secondary shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{c.title}</div>
              <div className="mt-0.5 truncate text-[11px] text-sidebar-foreground/55">{formatConversationDate(c.created_at)}</div>
            </div>
            <div className="flex shrink-0 gap-1 pt-0.5 opacity-0 transition group-hover:opacity-100">
              <button onClick={(e) => { e.stopPropagation(); togglePin(c); }}><Pin className="h-3 w-3" /></button>
              <button onClick={(e) => { e.stopPropagation(); deleteConv(c.id); }}><Trash2 className="h-3 w-3" /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-sidebar-border p-3 space-y-1">
        {isAdmin && (
          <Link to="/admin">
            <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground">
              <Shield className="h-4 w-4 mr-2" /> Admin panel
            </Button>
          </Link>
        )}
        {user ? (
          <Button variant="ghost" size="sm" onClick={() => { signOut(); nav("/"); }} className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground">
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        ) : null}
      </div>
    </aside>
  );

  return (
    <div className="h-screen flex chat-shell-bg overflow-hidden">
      {/* Desktop sidebar */}
      <div className={cn("hidden md:block overflow-hidden border-r border-sidebar-border/60 bg-sidebar transition-[width] duration-300 ease-out", sidebarOpen ? "w-72" : "w-0")}>
        {Sidebar}
      </div>

      {/* Mobile sidebar */}
      <div className="md:hidden absolute top-3 left-3 z-30">
        <Sheet>
          <SheetTrigger asChild>
            <Button size="icon" variant="outline"><Menu className="h-5 w-5" /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72">{Sidebar}</SheetContent>
        </Sheet>
      </div>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="deped-header-shell h-16 backdrop-blur-xl flex items-center justify-between px-4 md:px-6 shadow-sm">
          <div className="flex items-center gap-2 md:hidden pl-12"><Logo variant="light" /></div>
          <div className="hidden md:flex items-center gap-4">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label={sidebarOpen ? "Collapse conversations sidebar" : "Expand conversations sidebar"}
              title={sidebarOpen ? "Collapse conversations sidebar" : "Expand conversations sidebar"}
              className="text-white/85 hover:bg-white/10 hover:text-white"
            >
              <PanelLeftOpen className={cn("h-4 w-4 transition-transform duration-200", sidebarOpen && "rotate-180")} />
            </Button>
            <Link to="/" className="text-sm text-white/80 hover:text-white inline-flex items-center gap-1">
              <ChevronLeft className="h-4 w-4" /> Home
            </Link>
            <div className="h-7 w-px bg-white/20" />
            <div className="flex items-center gap-3">
              <img src={depedLogo} alt="DepEd seal" className="h-9 w-9 object-contain" />
              <div className="leading-tight text-white">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  ALAM Chat
                  <span className="official-chip hidden lg:inline-flex">
                    <BadgeCheck className="h-3 w-3 text-primary" />
                    DepEd-aligned
                  </span>
                </div>
                <div className="text-xs text-white/70">Education data assistant for cited answers</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              className="text-white hover:bg-white/10 hover:text-white"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={toggleCitationFormat}
                    aria-label="Toggle citation detail level"
                    className="gap-1.5 text-xs"
                  >
                    <Quote className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">
                      Citations: {citationFormat === "detailed" ? "Detailed" : "Short"}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] text-xs leading-relaxed">
                  <p className="font-medium mb-1">
                    {citationFormat === "detailed" ? "Detailed citations" : "Short citations"}
                  </p>
                  <p className="text-muted-foreground">
                    {citationFormat === "detailed"
                      ? "Sources show title, page numbers, and a quoted snippet from the document."
                      : "Sources show only the document title and page numbers."}
                  </p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground/80">
                    Click to switch to {citationFormat === "detailed" ? "Short" : "Detailed"}.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {messages.length > 0 && (
              <>
                <Button size="sm" variant="ghost" onClick={exportReport} title="Download conversation report">
                  <Download className="h-4 w-4" />
                  <span className="hidden lg:inline">Report</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copy(messages.map((m) => m.content).join("\n\n"))}
                  title="Copy conversation"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="container-chat py-6 md:py-8">
            {messages.length === 0 ? (
              <Empty collections={collections} documents={documents} onPick={send} onPreview={setPreviewDoc} />
            ) : (
              <div className="space-y-6 pb-2">
                {messages.map((m, i) => (
                  <Message key={i} m={m} documents={documents} onPreview={setPreviewDoc} showRetrievalDetails={isAdmin} />
                ))}
                {streaming && (messages[messages.length - 1]?.role === "user" || !messages[messages.length - 1]?.content) && (
                  <ThinkingBubble steps={thinking.length ? thinking : ["ALAM is thinking…"]} />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-border/80 bg-background/90 backdrop-blur-xl shadow-[0_-16px_40px_-32px_hsl(var(--foreground)/0.45)]">
          <div className="container-chat py-3 md:py-4">
            <ScopeBar
              collections={collections}
              documents={documents}
              scope={scope}
              onScopeChange={setScope}
            />
            <form
              onSubmit={(e) => { e.preventDefault(); send(); }}
              className="relative rounded-2xl border border-border bg-card/95 shadow-card transition-all focus-within:border-primary/50 focus-within:shadow-elegant"
            >
              {voiceStatus !== "idle" && (
                <VoiceModePanel
                  status={voiceStatus}
                  muted={voiceMuted}
                  transcript={voiceTranscript}
                  onMute={toggleVoiceMute}
                  onEnd={endVoiceMode}
                />
              )}
              <div className="pointer-events-none absolute left-4 top-3 hidden items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary/70 sm:flex">
                <BookOpenCheck className="h-3.5 w-3.5" />
                Ask ALAM
              </div>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder="Magtanong sa English, Filipino, Bisaya, Waray…"
                className={cn(
                  "resize-none border-0 focus-visible:ring-0 min-h-[76px] max-h-40 pt-6 pb-4 text-base bg-transparent sm:pt-9",
                  voiceStatus === "idle" || voiceStatus === "error" ? "pr-28" : "pr-16",
                )}
                rows={1}
              />
              <div className="absolute right-3 bottom-3 flex items-center gap-2">
                {(voiceStatus === "idle" || voiceStatus === "error") && (
                  <Button
                    size="icon"
                    type="button"
                    variant="outline"
                    onClick={startVoiceMode}
                    className="shadow-card"
                    title="Start Voice Mode"
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                )}
                {streaming ? (
                  <Button size="icon" type="button" variant="destructive" onClick={stop} className="shadow-card">
                    <Square className="h-4 w-4 fill-current" />
                  </Button>
                ) : (
                  <Button size="icon" type="submit" disabled={!input.trim()} className="bg-primary hover:bg-primary/90 shadow-card">
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </form>
            <p className="text-[11px] text-muted-foreground text-center mt-2">
              ALAM cites data responses. Verify critical decisions against the source dataset.
            </p>
          </div>
        </div>
      </main>

      <DocumentPreviewDialog
        doc={previewDoc}
        open={!!previewDoc}
        onOpenChange={(o) => { if (!o) setPreviewDoc(null); }}
      />
    </div>
  );
};

const voiceStatusLabel: Record<VoiceStatus, string> = {
  idle: "Voice off",
  connecting: "Connecting to ALAM Voice...",
  listening: "Listening...",
  thinking: "Thinking...",
  speaking: "Speaking...",
  muted: "Microphone muted",
  error: "Voice needs attention",
};

const VoiceVisualizer = ({ status, muted }: { status: VoiceStatus; muted: boolean }) => {
  const active = status === "listening" || status === "speaking" || status === "thinking";
  const Icon = status === "speaking" ? Volume2 : muted ? MicOff : Mic;

  return (
    <div className="flex items-center gap-3">
      <div className={cn("voice-orb", active && "voice-orb-active", muted && "voice-orb-muted")}>
        <Icon className="relative z-10 h-5 w-5" />
      </div>
      <div className="hidden h-12 min-w-40 items-center gap-1 rounded-full border border-border/70 bg-background/55 px-4 shadow-inner sm:flex">
        {Array.from({ length: 22 }).map((_, index) => (
          <span
            key={index}
            className={cn("voice-bar", active && !muted && "voice-bar-active", status === "speaking" && "voice-bar-speaking")}
            style={{
              height: `${8 + ((index * 7) % 24)}px`,
              animationDelay: `${index * 48}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
};

const VoiceModePanel = ({
  status,
  muted,
  transcript,
  onMute,
  onEnd,
}: {
  status: VoiceStatus;
  muted: boolean;
  transcript: string;
  onMute: () => void;
  onEnd: () => void;
}) => (
  <div className="mx-3 mt-3 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-card/95 to-secondary/10 p-3 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.08)]">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <VoiceVisualizer status={status} muted={muted} />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-secondary/30 bg-secondary/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-secondary-foreground dark:text-secondary">
              Voice Mode
            </span>
            <span className="text-sm font-semibold text-foreground">{voiceStatusLabel[status]}</span>
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {transcript || "Speak naturally in English, Filipino, Bisaya, Waray, or your local language."}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:pl-3">
        <Button type="button" size="sm" variant="outline" onClick={onMute} className="h-10 min-w-28 gap-2 rounded-full bg-background/80">
          {muted ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
          <span>{muted ? "Unmute" : "Mute"}</span>
        </Button>
        <Button type="button" size="sm" variant="destructive" onClick={onEnd} className="h-10 min-w-24 gap-2 rounded-full shadow-card">
          <PhoneOff className="h-3.5 w-3.5" />
          <span>End</span>
        </Button>
      </div>
    </div>
  </div>
);

const Empty = ({
  collections,
  documents,
  onPick,
  onPreview,
}: {
  collections: Collection[];
  documents: DocItem[];
  onPick: (s: string) => void;
  onPreview: (d: PreviewDoc) => void;
}) => {
  const suggestions = useMemo(() => makeSmartSuggestions(collections, documents), [collections, documents]);

  return (
  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-4xl py-8 text-center md:py-12">
    <div className="mx-auto mb-5 inline-flex items-center gap-3 rounded-full border border-border bg-card/85 px-4 py-2 text-xs font-semibold text-muted-foreground shadow-card backdrop-blur">
      <img src={depedLogo} alt="DepEd seal" className="h-8 w-8 object-contain" />
      <span>Department of Education data assistant</span>
    </div>
    <h2 className="font-display text-3xl font-extrabold leading-tight text-foreground md:text-5xl">
      Kumusta, ano ang gusto mong malaman?
    </h2>
    <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
      Ask in English, Filipino, Bisaya, Waray, or your local language. ALAM will search uploaded DepEd datasets and documents, then cite the sources it used.
    </p>

    <div className="mt-6 flex flex-wrap justify-center gap-2">
      <span className="official-chip"><Database className="h-3.5 w-3.5 text-primary" /> {collections.length} datasets</span>
      <span className="official-chip"><FileText className="h-3.5 w-3.5 text-primary" /> {documents.length} documents</span>
      <span className="official-chip"><BadgeCheck className="h-3.5 w-3.5 text-primary" /> Cited answers</span>
    </div>

    <div className="mt-8 rounded-2xl border border-border bg-card/80 p-3 text-left shadow-card backdrop-blur">
      <div className="grid gap-3 sm:grid-cols-2">
      {suggestions.map((s) => (
        <button
          key={s.prompt}
          onClick={() => onPick(s.prompt)}
          className="group min-h-24 rounded-xl border border-border bg-background/80 p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-muted/60 hover:shadow-card focus:outline-none focus:ring-2 focus:ring-ring/30"
        >
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="h-3 w-3" />
            {s.category}
          </div>
          <div className="mt-1 text-sm font-medium">{s.prompt}</div>
        </button>
      ))}
      </div>
    </div>

    {collections.length > 0 && (
      <div className="mt-12">
        <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-4">
          <Database className="h-3.5 w-3.5" /> Available datasets
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {collections.map((c) => (
            <button
              key={c.id}
              onClick={() => onPick(`Tell me about ${c.name}`)}
              className="px-3 py-1.5 rounded-full bg-muted hover:bg-muted/70 text-xs font-medium border border-border"
            >
              {c.name} <span className="text-muted-foreground">· {c.row_count.toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>
    )}

    {documents.length > 0 && (
      <div className="mt-8">
        <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-4">
          <FileText className="h-3.5 w-3.5" /> Available documents
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {documents.map((d) => (
            <button
              key={d.id}
              onClick={() => onPick(`Summarize the document "${d.title}"`)}
              className="px-3 py-1.5 rounded-full bg-muted hover:bg-muted/70 text-xs font-medium border border-border inline-flex items-center gap-1.5"
              title={`Summarize ${d.title}`}
            >
              <FileText className="h-3 w-3 text-secondary" />
              <span className="max-w-[180px] truncate">{d.title}</span>
              <span className="text-muted-foreground capitalize">· {d.doc_type}</span>
            </button>
          ))}
        </div>
      </div>
    )}
  </motion.div>
  );
};

const ScopeBar = ({
  collections,
  documents,
  scope,
  onScopeChange,
}: {
  collections: Collection[];
  documents: DocItem[];
  scope: ChatScope;
  onScopeChange: (scope: ChatScope) => void;
}) => {
  const selectedCollection = scope.type === "dataset" ? collections.find((c) => c.slug === scope.slug) : null;
  const scopeLabel = scope.type === "documents"
    ? `Documents only (${documents.length})`
    : selectedCollection
      ? `${selectedCollection.name} (${selectedCollection.row_count.toLocaleString()} rows)`
      : `All sources (${collections.length} datasets, ${documents.length} documents)`;

  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card/90 px-3 py-2 text-xs text-muted-foreground shadow-card">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Database className="h-3.5 w-3.5 text-primary" />
        </span>
        <span className="truncate">
          Searching <span className="font-medium text-foreground">{scopeLabel}</span>
        </span>
      </div>
      <label className="flex items-center gap-2">
        <span className="sr-only">Chat source scope</span>
        <select
          value={scope.type === "dataset" ? `dataset:${scope.slug}` : scope.type}
          onChange={(e) => {
            const value = e.target.value;
            if (value === "documents") onScopeChange({ type: "documents" });
            else if (value.startsWith("dataset:")) onScopeChange({ type: "dataset", slug: value.slice("dataset:".length) });
            else onScopeChange({ type: "all" });
          }}
          className="h-8 max-w-[260px] rounded-lg border border-border bg-background px-2 text-xs font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20"
        >
          <option value="all">All sources</option>
          {collections.map((c) => (
            <option key={c.id} value={`dataset:${c.slug}`}>{c.name}</option>
          ))}
          <option value="documents" disabled={documents.length === 0}>Documents only</option>
        </select>
      </label>
    </div>
  );
};

const AIAvatar = ({ animated = false }: { animated?: boolean }) => (
  <div className="relative shrink-0">
    {animated && (
      <motion.span
        className="absolute inset-0 rounded-full bg-primary/30"
        animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
    )}
    <motion.div
      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-primary/20 bg-card shadow-card"
      animate={animated ? { rotate: [0, 8, -8, 0] } : undefined}
      transition={animated ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" } : undefined}
    >
      <img src={depedLogo} alt="" className="h-7 w-7 object-contain" />
    </motion.div>
  </div>
);

const UserAvatar = () => (
  <div className="h-9 w-9 rounded-full bg-chat-user flex items-center justify-center shrink-0 shadow-card ring-2 ring-background">
    <UserIcon className="h-4 w-4 text-chat-user-foreground" />
  </div>
);

const ThinkingBubble = ({ steps }: { steps: string[] }) => (
  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 items-start">
    <AIAvatar animated />
    <div className="deped-message-frame bg-chat-bubble text-chat-bubble-foreground rounded-2xl px-5 py-4 max-w-[85%]">
      <div className="flex items-center gap-3 text-sm">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-2 w-2 rounded-full bg-secondary"
              animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
            />
          ))}
        </div>
        <AnimatePresence mode="wait">
          <motion.span key={steps[steps.length - 1]} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="text-chat-bubble-foreground/80">
            {steps[steps.length - 1] ?? "ALAM is thinking…"}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  </motion.div>
);

const Message = ({
  m,
  documents = [],
  onPreview,
  showRetrievalDetails = false,
}: {
  m: Msg;
  documents?: DocItem[];
  onPreview?: (d: PreviewDoc) => void;
  showRetrievalDetails?: boolean;
}) => {
  if (m.role === "user") {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end gap-3 items-start">
        <div className="bg-chat-user text-chat-user-foreground rounded-2xl rounded-tr-md px-5 py-3 max-w-[86%] shadow-card md:max-w-[78%]">
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{m.content}</div>
        </div>
        <UserAvatar />
      </motion.div>
    );
  }

  // Build a normalized lookup of document titles/filenames -> document for clickable citations.
  const normalizeDocText = (text: string) => text.toLowerCase().replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/g, " ").trim();
  const extractText = (children: any): string => {
    if (children == null || typeof children === "boolean") return "";
    if (typeof children === "string" || typeof children === "number") return String(children);
    if (Array.isArray(children)) return children.map(extractText).join("");
    if (children?.props?.children === children) return "";
    return children?.props ? extractText(children.props.children) : "";
  };
  const docAliases = documents.flatMap((d) => [d.title, d.source_filename, d.title.replace(/\.[a-z0-9]+$/i, "")]
    .filter(Boolean)
    .map((alias) => ({ alias: normalizeDocText(alias), doc: d }))
    .filter(({ alias }) => alias.length >= 4));

  const findDocFromChildren = (children: any): DocItem | null => {
    const key = normalizeDocText(extractText(children));
    if (!key) return null;
    const exact = docAliases.find(({ alias }) => alias === key);
    if (exact) return exact.doc;
    return docAliases.find(({ alias }) => key.includes(alias) || alias.includes(key))?.doc ?? null;
  };

  const SourceLine = forwardRef<HTMLLIElement, any>(({ children, ...props }, ref) => {
    const matched = onPreview ? findDocFromChildren(children) : null;
    if (!matched) return <li ref={ref} {...props}>{children}</li>;
    return (
      <li
        ref={ref}
        {...props}
        role="button"
        tabIndex={0}
        onClick={() => onPreview!(matched)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onPreview!(matched); }}
        className="cursor-pointer rounded-md px-1 transition hover:bg-white/10 hover:text-secondary"
        title="Open document preview"
      >
        {children}
      </li>
    );
  });
  SourceLine.displayName = "SourceLine";

  const InlineDocTitle = forwardRef<HTMLElement, any>(({ children, as: Comp = "em", ...props }, ref) => {
    const matched = onPreview ? findDocFromChildren(children) : null;
    if (!matched) return <Comp ref={ref} {...props}>{children}</Comp>;
    return (
      <button
        ref={ref as any}
        type="button"
        onClick={() => onPreview!(matched)}
        className="not-italic font-semibold text-secondary underline decoration-secondary/50 underline-offset-2 hover:decoration-secondary hover:text-secondary/90 transition cursor-pointer inline"
        title="Open document preview"
      >
        {children}
      </button>
    );
  });
  InlineDocTitle.displayName = "InlineDocTitle";
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex min-w-0 gap-3 items-start">
      <AIAvatar animated={!m.content} />
      <div className="deped-message-frame min-w-0 max-w-full overflow-hidden bg-chat-bubble text-chat-bubble-foreground rounded-2xl rounded-tl-md px-5 py-4 prose prose-sm prose-table:my-3 prose-headings:font-display prose-headings:text-chat-bubble-foreground prose-h2:mt-6 prose-h2:border-b prose-h2:border-white/10 prose-h2:pb-2 prose-h2:text-lg prose-h3:mt-5 prose-h3:text-base prose-p:my-3 prose-p:leading-7 prose-ul:my-3 prose-li:my-1 prose-li:leading-6 prose-strong:text-chat-bubble-foreground prose-strong:font-semibold prose-p:text-chat-bubble-foreground prose-li:text-chat-bubble-foreground prose-td:text-chat-bubble-foreground prose-th:text-chat-bubble-foreground md:max-w-[90%]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            table: (props) => <ExpandableTable {...props} />,
            thead: (props) => <thead className="bg-white/10" {...props} />,
            th: (props) => <th className="text-left px-2.5 py-2 border-b border-white/20 font-semibold text-[11px] uppercase tracking-wide leading-tight align-bottom" {...props} />,
            td: (props) => <td className="px-2.5 py-1.5 border-b border-white/10 align-top text-xs leading-snug" {...props} />,
            tr: (props) => <tr className="odd:bg-white/[0.03] hover:bg-white/[0.07]" {...props} />,
            li: (props) => <SourceLine {...props} />,
            code: ({ inline, className, children, ...props }: any) => {
              const lang = /language-(\w+)/.exec(className || "")?.[1];
              if (!inline && lang === "chart") {
                return <ChartBlock raw={String(children).trim()} />;
              }
              return inline
                ? <code className="bg-white/10 px-1.5 py-0.5 rounded text-secondary" {...props}>{children}</code>
                : <code className="block bg-black/40 p-3 rounded text-xs overflow-x-auto" {...props}>{children}</code>;
            },
            a: (props) => <a className="text-secondary underline" target="_blank" rel="noreferrer" {...props} />,
            em: (props) => <InlineDocTitle {...props} as="em" />,
            strong: (props) => <InlineDocTitle {...props} as="strong" />,
          }}
        >
          {normalizeMathText(m.content) || "…"}
        </ReactMarkdown>
        {m.citations && m.citations.length > 0 && <AnswerConfidence citations={m.citations} content={m.content} />}
        {m.citations && m.citations.length > 0 && <DataCoverageNote citations={m.citations} />}
        {m.citations && m.citations.length > 0 && <RetrievedContextDetails citations={m.citations} adminView={showRetrievalDetails} />}
        {false && m.citations && m.citations.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-2">
            {m.citations.map((c, i) => {
              const total = (c as any).total as number | undefined;
              return (
              <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground">
                📁 <span className="font-medium text-foreground">{c.collection}</span>
                {typeof total === "number" && total > c.record_count
                  ? ` — analyzed ${c.record_count.toLocaleString()} of ${total.toLocaleString()} records`
                  : ` — ${c.record_count.toLocaleString()} records`}
              </span>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};

const AnswerConfidence = ({ citations, content }: { citations: NonNullable<Msg["citations"]>; content: string }) => {
  const hasUncertainty = /\b(couldn't find|cannot determine|not available|limitation|limited|hindi matukoy|walang sapat)\b/i.test(content);
  const datasetCitations = citations.filter((c) => !c.collection.startsWith("doc:"));
  const hasFullDatasetCoverage = datasetCitations.some((c) => typeof c.total === "number" && c.total > 0);
  const level = hasUncertainty ? "Limited" : hasFullDatasetCoverage || citations.length >= 2 ? "High" : "Medium";
  const tone = level === "High" ? "text-emerald-300 border-emerald-300/25 bg-emerald-300/10" : level === "Medium" ? "text-secondary border-secondary/25 bg-secondary/10" : "text-amber-200 border-amber-200/25 bg-amber-200/10";
  return (
    <div className="not-prose mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3 text-xs">
      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold", tone)}>
        {level === "Limited" ? <AlertTriangle className="h-3.5 w-3.5" /> : <BadgeCheck className="h-3.5 w-3.5" />}
        {level} source confidence
      </span>
      <span className="text-chat-bubble-foreground/60">Based on {citations.length} retrieved source{citations.length === 1 ? "" : "s"}</span>
    </div>
  );
};

const RetrievedContextDetails = ({ citations, adminView = false }: { citations: NonNullable<Msg["citations"]>; adminView?: boolean }) => (
  <details className="not-prose mt-3 border-t border-white/10 pt-3 text-xs text-muted-foreground">
    <summary className="cursor-pointer select-none font-medium text-chat-bubble-foreground/80 hover:text-secondary">
      <span className="inline-flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> Inspect sources{adminView ? " and retrieval details" : ""}</span>
    </summary>
    <div className="mt-2 flex flex-wrap gap-2">
      {citations.map((c, i) => {
        const isDocument = c.collection.startsWith("doc:");
        const label = isDocument ? c.collection.replace(/^doc:/, "") : c.collection;
        const detail = isDocument
          ? `${c.record_count.toLocaleString()} document chunks retrieved`
          : typeof c.total === "number" && c.total > c.record_count
            ? `${c.record_count.toLocaleString()} sample rows retrieved; totals computed from ${c.total.toLocaleString()} rows`
            : `${c.record_count.toLocaleString()} rows retrieved`;

        return (
          <span key={`${c.collection}-${i}`} className="inline-flex max-w-full items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-chat-bubble-foreground/75">
            <span className="font-medium text-secondary">{isDocument ? "Doc" : "Data"}</span>
            <span className="truncate font-medium text-chat-bubble-foreground">{label}</span>
            <span>- {detail}</span>
          </span>
        );
      })}
    </div>
  </details>
);

const DataCoverageNote = ({ citations }: { citations: NonNullable<Msg["citations"]> }) => {
  const datasetCitations = citations.filter((c) => !c.collection.startsWith("doc:"));
  if (datasetCitations.length === 0) return null;
  const hasFullCoverage = datasetCitations.some((c) => typeof c.total === "number" && c.total >= c.record_count);
  const note = hasFullCoverage
    ? "Dataset totals and numeric summaries are computed from the full matching records when available; row tables may show retrieved samples."
    : "Answer is based on the retrieved dataset rows shown to the model.";
  return (
    <div className="not-prose mt-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-relaxed text-chat-bubble-foreground/75">
      {note}
    </div>
  );
};

function ExpandableTable(props: any) {
  const [open, setOpen] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  const copyTable = () => {
    const text = tableRef.current?.innerText?.trim();
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success("Table copied");
  };
  const downloadCsv = () => {
    const table = tableRef.current;
    if (!table) return;
    const rows = Array.from(table.querySelectorAll("tr")).map((tr) =>
      Array.from(tr.querySelectorAll("th,td")).map((cell) => {
        const value = (cell.textContent ?? "").replace(/\s+/g, " ").trim();
        return `"${value.replace(/"/g, '""')}"`;
      }).join(",")
    );
    if (rows.length === 0) return;
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "alam-table.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="not-prose my-3 relative group w-full max-w-full overflow-hidden">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md bg-black/40 hover:bg-black/60 text-white/90 backdrop-blur opacity-70 group-hover:opacity-100 transition"
            title="Expand table"
          >
            <Maximize2 className="h-3 w-3" /> Expand
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <DialogTitle>Table view</DialogTitle>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={copyTable}>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={downloadCsv}>
                  <Download className="h-3.5 w-3.5" /> CSV
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="max-h-[80vh] max-w-full overflow-auto rounded-lg border border-border">
            <table ref={tableRef} className="w-full table-fixed text-sm border-collapse [&_th]:bg-muted [&_th]:sticky [&_th]:top-0 [&_th]:text-left [&_th]:px-3 [&_th]:py-2 [&_th]:border-b [&_th]:border-border [&_th]:font-semibold [&_th]:break-words [&_td]:px-3 [&_td]:py-2 [&_td]:border-b [&_td]:border-border [&_td]:break-words [&_tr:hover]:bg-muted/40">
              {props.children}
            </table>
          </div>
        </DialogContent>
      </Dialog>
      <div className="max-h-[420px] max-w-full overflow-auto rounded-lg border border-white/15">
        <table className="w-full table-fixed text-xs border-collapse [&_th]:break-words [&_td]:break-words">{props.children}</table>
      </div>

    </div>
  );
}

export default Chat;
