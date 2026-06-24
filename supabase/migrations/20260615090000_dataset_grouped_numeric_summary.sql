create or replace function public.dataset_grouped_numeric_summary(
  p_collection_id uuid,
  p_group_key text,
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
    select
      coalesce(nullif(trim(r.data ->> p_group_key), ''), '(blank)') as group_value,
      kv.key as metric,
      nullif(replace(kv.value #>> '{}', ',', ''), '')::numeric as value
    from public.dataset_rows r
    cross join lateral jsonb_each(r.data) kv
    where r.collection_id = p_collection_id
      and (p_sheet is null or r.sheet_name = p_sheet)
      and r.data ? p_group_key
      and kv.key <> p_group_key
      and jsonb_typeof(kv.value) in ('number', 'string')
      and replace(kv.value #>> '{}', ',', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
  ),
  totals as (
    select group_value, metric, sum(value) as total
    from unpacked
    where value is not null
    group by group_value, metric
  ),
  grouped as (
    select group_value, jsonb_object_agg(metric, total) as totals
    from totals
    group by group_value
  )
  select jsonb_agg(
    jsonb_build_object('group', group_value, 'totals', totals)
    order by group_value
  )
  into result
  from grouped;

  return coalesce(result, '[]'::jsonb);
end;
$$;

