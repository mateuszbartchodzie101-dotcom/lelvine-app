-- LELVINE concise readable audit for the two flagged functions (read-only)
-- Shows only executable body lines, with boilerplate removed.

with funcs as (
  select
    p.proname as function_name,
    pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('add_org_owner_membership','create_player_device')
),
lines as (
  select
    function_name,
    row_number() over (partition by function_name) as line_no,
    trim(line) as line
  from funcs,
  lateral regexp_split_to_table(definition, E'\\n') as line
)
select function_name, line_no, line
from lines
where line <> ''
  and lower(line) not like 'create or replace function%'
  and lower(line) not like 'returns %'
  and lower(line) not like 'language %'
  and lower(line) <> 'security definer'
  and lower(line) not like 'set search_path%'
  and lower(line) not like 'as $function$%'
  and lower(line) <> '$function$'
order by function_name, line_no;
