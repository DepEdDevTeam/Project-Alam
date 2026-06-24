CREATE TABLE IF NOT EXISTS public.ai_settings (
  id integer PRIMARY KEY DEFAULT 1,
  chat_model text NOT NULL DEFAULT 'gpt-4o',
  router_model text NOT NULL DEFAULT 'gpt-4o-mini',
  temperature numeric NOT NULL DEFAULT 0.7,
  max_tokens integer NOT NULL DEFAULT 4000,
  system_prompt_override text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT ai_settings_singleton CHECK (id = 1)
);

INSERT INTO public.ai_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated reads ai_settings"
ON public.ai_settings FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins manage ai_settings"
ON public.ai_settings FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_ai_settings_updated_at
BEFORE UPDATE ON public.ai_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();