ALTER PUBLICATION supabase_realtime ADD TABLE public.collections;
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
ALTER TABLE public.collections REPLICA IDENTITY FULL;
ALTER TABLE public.documents REPLICA IDENTITY FULL;