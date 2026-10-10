-- LELVINE readable definitions for the two flagged functions (read-only)
-- Run in Supabase SQL Editor. This only displays the function bodies line by line.

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
    line
  from funcs,
  lateral regexp_split_to_table(definition, E'\\n') as line
)
select function_name, line_no, line
from lines
order by function_name, line_no;
