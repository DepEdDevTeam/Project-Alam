import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, Database, MessageSquare, ShieldCheck, Sparkles, BarChart3, Languages, Zap, FileSpreadsheet, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { useThemeMode } from "@/hooks/useThemeMode";
import depedLogo from "@/assets/deped-logo.png";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.1 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};

const Landing = () => {
  const { user, isAdmin } = useAuth();
  const { theme, toggleTheme } = useThemeMode();

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="deped-header-shell sticky top-0 z-40 backdrop-blur-xl">
        <div className="container-chat relative z-10 flex items-center justify-between h-16">
          <Logo variant="light" />
          <nav className="flex items-center gap-2">
            <a href="#capabilities" className="hidden md:inline text-sm text-white/80 hover:text-white transition px-3 py-2">Capabilities</a>
            <a href="#sources" className="hidden md:inline text-sm text-white/80 hover:text-white transition px-3 py-2">Data sources</a>
            <a href="#stack" className="hidden md:inline text-sm text-white/80 hover:text-white transition px-3 py-2">Tech stack</a>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              className="text-white hover:bg-white/10 hover:text-white"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Link to="/admin" aria-label="Open admin page">
              <Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/10">
                <ShieldCheck className="h-4 w-4 md:mr-1" />
                <span className="hidden md:inline">Admin</span>
              </Button>
            </Link>
            {user ? (
              <Link to="/chat"><Button size="sm" className="bg-white text-primary hover:bg-white/90 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90">Open chat <ArrowRight className="ml-1 h-4 w-4" /></Button></Link>
            ) : (
              <>
                <Link to="/auth"><Button variant="ghost" size="sm" className="text-white hover:text-white hover:bg-white/10">Sign in</Button></Link>
                <Link to="/chat"><Button size="sm" className="bg-white text-primary hover:bg-white/90 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90">Try as guest</Button></Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-radial pointer-events-none" />
        {/* DepEd seal watermark */}
        <div aria-hidden className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <img src={depedLogo} alt="" className="w-[520px] md:w-[680px] max-w-[90vw] opacity-[0.07] select-none" />
        </div>
        <div className="container-chat relative pt-20 pb-28 md:pt-28 md:pb-36 text-center">
          <motion.div {...fadeUp}>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-secondary/15 border border-secondary/30 text-xs font-semibold text-foreground tracking-wide">
              <Sparkles className="h-3.5 w-3.5 text-secondary" />
              Para sa DepEd · Bilingual AI assistant
            </span>
          </motion.div>

          <motion.h1
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.05 }}
            className="mt-8 font-display font-extrabold text-5xl md:text-7xl tracking-tight"
          >
            Magtanong sa <span className="deped-gradient-text">datos ng DepEd</span>.
            <br />
            Get answers, instantly.
          </motion.h1>

          <motion.p
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.1 }}
            className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto"
          >
            ALAM is a conversational interface to Philippine education data. Ask in English or Filipino — get cited, source-backed answers in seconds.
          </motion.p>

          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.15 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-3"
          >
            <Link to="/chat">
              <Button size="lg" className="h-12 px-8 text-base shadow-elegant">
                Start chatting <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a href="#capabilities">
              <Button size="lg" variant="outline" className="h-12 px-8 text-base">
                Learn more
              </Button>
            </a>
          </motion.div>

          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.25 }}
            className="mt-16 grid grid-cols-3 max-w-2xl mx-auto gap-6 text-center"
          >
            {[
              { k: "EN / FIL", v: "Bilingual" },
              { k: "Always", v: "Cited sources" },
              { k: "Sub-sec", v: "Streaming" },
            ].map((s) => (
              <div key={s.k}>
                <div className="font-display font-bold text-2xl deped-gradient-text">{s.k}</div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1">{s.v}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Capabilities */}
      <section id="capabilities" className="py-24 bg-muted/40">
        <div className="container-chat">
          <motion.div {...fadeUp} className="max-w-2xl">
            <h2 className="font-display font-bold text-4xl md:text-5xl">Built for the way DepEd works</h2>
            <p className="mt-4 text-lg text-muted-foreground">From division reports to nationwide rollups — ALAM turns your spreadsheets into answers.</p>
          </motion.div>

          <div className="mt-14 grid md:grid-cols-3 gap-6">
            {[
              { icon: MessageSquare, title: "Natural-language queries", body: "Ask conversationally in Filipino or English. ALAM resolves pronouns, follow-ups, and ambiguous regions." },
              { icon: Database, title: "Always-cited answers", body: "Every data response includes 📁 Source: [collection] (X records). No hallucinations, no guesses." },
              { icon: BarChart3, title: "Smart tables", body: "Results render as wrapped, paginated tables (50-row batches) — click to expand fullscreen." },
              { icon: Languages, title: "Bilingual fluency", body: "Switch languages mid-conversation. ALAM detects and responds in the same language as your last message." },
              { icon: Zap, title: "Streaming responses", body: "See reasoning steps in real time: Querying → Analyzing → Responding. Stop generation anytime." },
              { icon: ShieldCheck, title: "DepEd-only access", body: "Sign-in restricted to @deped.gov.ph. Role-based admin panel for dataset stewards." },
            ].map((c, i) => (
              <motion.div
                key={c.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: 0.05 * i }}
                className="rounded-2xl bg-card border border-border p-6 shadow-card hover:shadow-elegant transition-shadow"
              >
                <div className="h-11 w-11 rounded-xl bg-gradient-hero flex items-center justify-center shadow-elegant">
                  <c.icon className="h-5 w-5 text-secondary" />
                </div>
                <h3 className="mt-4 font-display font-bold text-lg">{c.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{c.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How to use */}
      <section className="py-24">
        <div className="container-chat">
          <motion.div {...fadeUp} className="max-w-2xl">
            <h2 className="font-display font-bold text-4xl md:text-5xl">Three steps to an answer</h2>
          </motion.div>
          <div className="mt-14 grid md:grid-cols-3 gap-8">
            {[
              { n: "01", t: "Ask", d: "Type your question — \"Ilan ang public schools sa Region IV-A?\" or \"Compare enrollment by region for SY 2023-24\"." },
              { n: "02", t: "Watch", d: "ALAM streams its reasoning: which dataset it's pulling from, how it's filtering, and what it's computing." },
              { n: "03", t: "Trust", d: "Receive a cited answer with the source collection and exact record count. Export, share, or follow up." },
            ].map((s, i) => (
              <motion.div key={s.n} {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.05 * i }}>
                <div className="font-display font-extrabold text-6xl deped-gradient-text leading-none">{s.n}</div>
                <h3 className="mt-4 font-display font-bold text-2xl">{s.t}</h3>
                <p className="mt-2 text-muted-foreground leading-relaxed">{s.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Data sources */}
      <section id="sources" className="py-24 bg-gradient-hero text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 30% 30%, hsl(var(--secondary)) 0, transparent 50%)" }} />
        <div className="container-chat relative">
          <motion.div {...fadeUp} className="max-w-2xl">
            <h2 className="font-display font-bold text-4xl md:text-5xl text-white">Curated DepEd datasets</h2>
            <p className="mt-4 text-lg text-white/80">Admins upload Excel and CSV files. ALAM unifies multi-sheet workbooks, profiles columns, and indexes everything for instant search.</p>
          </motion.div>
          <div className="mt-14 grid md:grid-cols-4 gap-4">
            {["Enrollment", "Schools", "Personnel", "Performance", "Facilities", "Programs", "Regions", "Divisions"].map((d, i) => (
              <motion.div
                key={d}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: 0.04 * i }}
                className="rounded-xl bg-white/5 backdrop-blur border border-white/15 p-5 hover:bg-white/10 transition"
              >
                <FileSpreadsheet className="h-5 w-5 text-secondary" />
                <div className="mt-3 font-semibold">{d}</div>
                <div className="text-xs text-white/60 mt-1">Collection</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Tech stack */}
      <section id="stack" className="py-24">
        <div className="container-chat">
          <motion.div {...fadeUp} className="max-w-2xl">
            <h2 className="font-display font-bold text-4xl md:text-5xl">Modern, secure, fast</h2>
            <p className="mt-4 text-lg text-muted-foreground">React + TypeScript front-end, Postgres-backed search, and a streaming AI gateway for sub-second responses.</p>
          </motion.div>
          <div className="mt-12 flex flex-wrap gap-3">
            {["React 18", "TypeScript", "Vite", "Tailwind", "shadcn/ui", "Postgres", "tsvector FTS", "Edge Functions", "Streaming SSE", "AI Gateway", "GPT-5.2", "Row-level security"].map((t) => (
              <span key={t} className="px-4 py-2 rounded-full bg-card border border-border text-sm font-medium shadow-card">{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="container-chat flex flex-col md:flex-row items-center justify-between gap-4">
          <Logo />
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Project ALAM · Department of Education, Republic of the Philippines.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
