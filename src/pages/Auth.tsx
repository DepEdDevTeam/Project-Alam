import { useState } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, Mail, Lock, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { isDepedEmail, DEPED_DOMAIN } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";

const Auth = () => {
  const { session, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (session) return <Navigate to="/chat" replace />;

  const validate = (mode: "in" | "up") => {
    if (!isDepedEmail(email)) {
      toast.error(`Only ${DEPED_DOMAIN} email addresses are allowed.`);
      return false;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return false;
    }
    if (mode === "up" && !fullName.trim()) {
      toast.error("Please enter your full name.");
      return false;
    }
    return true;
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate("up")) return;
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/chat`,
        data: { full_name: fullName },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("deped.gov.ph") ? `Only ${DEPED_DOMAIN} emails allowed.` : error.message);
      return;
    }
    toast.success("Account created. Welcome to ALAM!");
    nav("/chat");
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate("in")) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    nav("/chat");
  };

  const google = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/chat`,
      },
    });
    setBusy(false);
    if (error) toast.error(error.message ?? "Google sign-in failed");
  };

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 w-1/2 bg-gradient-hero text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-15" style={{ backgroundImage: "radial-gradient(circle at 70% 30%, hsl(var(--secondary)) 0, transparent 50%)" }} />
        <Logo variant="light" />
        <div className="relative">
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="font-display font-extrabold text-5xl leading-tight">
            Welcome to <span className="text-secondary">ALAM</span>.
          </motion.h1>
          <p className="mt-4 text-white/80 text-lg max-w-md">
            The Department of Education's bilingual AI data assistant. Sign in with your DepEd account to begin.
          </p>
        </div>
        <p className="text-xs text-white/60 relative">© {new Date().getFullYear()} Department of Education · Republic of the Philippines</p>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>

          <div className="lg:hidden mb-8"><Logo /></div>

          <h2 className="font-display font-bold text-3xl">Sign in to ALAM</h2>
          <p className="mt-2 text-muted-foreground">Restricted to <span className="font-semibold text-foreground">{DEPED_DOMAIN}</span> accounts.</p>

          <Tabs defaultValue="in" className="mt-8">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="in">Sign in</TabsTrigger>
              <TabsTrigger value="up">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="in" className="mt-6">
              <form onSubmit={signIn} className="space-y-4">
                <Field icon={Mail} label="DepEd email" type="email" value={email} onChange={setEmail} placeholder={`juan.delacruz${DEPED_DOMAIN}`} />
                <Field icon={Lock} label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
                <Button type="submit" disabled={busy} className="w-full h-11">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="up" className="mt-6">
              <form onSubmit={signUp} className="space-y-4">
                <div className="space-y-2">
                  <Label>Full name</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Juan Dela Cruz" />
                </div>
                <Field icon={Mail} label="DepEd email" type="email" value={email} onChange={setEmail} placeholder={`juan.delacruz${DEPED_DOMAIN}`} />
                <Field icon={Lock} label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 8 characters" />
                <Button type="submit" disabled={busy} className="w-full h-11">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" onClick={google} disabled={busy} className="w-full h-11">
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fbbc04" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#ea4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
            Continue with Google
          </Button>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By signing in you agree to use ALAM for official DepEd purposes.
          </p>
        </div>
      </div>
    </div>
  );
};

const Field = ({ icon: Icon, label, type, value, onChange, placeholder }: any) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input className="pl-10 h-11" type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required />
    </div>
  </div>
);

export default Auth;
