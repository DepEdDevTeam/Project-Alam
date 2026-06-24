
CREATE POLICY "No public access to response_cache" ON public.response_cache FOR SELECT USING (false);
CREATE POLICY "No public access to rate_limits" ON public.rate_limits FOR SELECT USING (false);
