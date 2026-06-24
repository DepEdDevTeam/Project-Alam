-- 1) pgvector
create extension if not exists vector;

-- 2) Embedding columns
alter table public.document_chunks
  add column if not exists embedding vector(1536),
  add column if not exists embedding_model text;

alter table public.dataset_rows
  add column if not exists embedding vector(1536),
  add column if not exists embedding_model text,
  add column if not exists embedding_text text;

-- 3) HNSW indexes
create index if not exists document_chunks_embedding_idx
  on public.document_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists dataset_rows_embedding_idx
  on public.dataset_rows using hnsw (embedding vector_cosine_ops);

-- 4) Hybrid match RPCs
create or replace function public.match_document_chunks(
  query_embedding vector(1536),
  p_document_ids uuid[] default null,
  match_count int default 12
)
returns table (
  id uuid,
  document_id uuid,
  page_number int,
  chunk_index int,
  section_title text,
  content text,
  similarity float
)
language sql stable
set search_path = public
as $$
  select dc.id, dc.document_id, dc.page_number, dc.chunk_index,
         dc.section_title, dc.content,
         1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  where dc.embedding is not null
    and (p_document_ids is null or dc.document_id = any(p_document_ids))
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function public.match_dataset_rows(
  query_embedding vector(1536),
  p_collection_id uuid,
  p_sheet text default null,
  match_count int default 60
)
returns table (
  id uuid,
  sheet_name text,
  data jsonb,
  similarity float
)
language sql stable
set search_path = public
as $$
  select r.id, r.sheet_name, r.data,
         1 - (r.embedding <=> query_embedding) as similarity
  from public.dataset_rows r
  where r.collection_id = p_collection_id
    and r.embedding is not null
    and (p_sheet is null or r.sheet_name = p_sheet)
  order by r.embedding <=> query_embedding
  limit match_count;
$$;

-- 5) DB-side numeric summary across ALL matching rows
create or replace function public.dataset_numeric_summary(
  p_collection_id uuid,
  p_sheet text default null
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  result jsonb;
begin
  with unpacked as (
    select kv.key as k,
           nullif(kv.value #>> '{}', '')::numeric as n
    from public.dataset_rows r
    cross join lateral jsonb_each(r.data) kv
    where r.collection_id = p_collection_id
      and (p_sheet is null or r.sheet_name = p_sheet)
      and jsonb_typeof(kv.value) in ('number','string')
      and (kv.value #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$'
  )
  select jsonb_object_agg(k, jsonb_build_object(
    'count', count(n),
    'sum', sum(n),
    'avg', avg(n),
    'min', min(n),
    'max', max(n)
  ))
  into result
  from unpacked
  where n is not null
  group by ()
  ;
  return coalesce(result, '{}'::jsonb);
end;
$$;