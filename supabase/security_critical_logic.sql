-- LELVINE critical function logic summary (read-only)
-- Shows only security-relevant executable lines.

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
  and (
    lower(line) like '%auth.uid%'
    or lower(line) like '%auth.role%'
    or lower(line) like '%current_user%'
    or lower(line) like '%new.%'
    or lower(line) like '%insert into%'
    or lower(line) like '%update %'
    or lower(line) like '%delete from%'
    or lower(line) like '%select %'
    or lower(line) like '%from public.%'
    or lower(line) like '%where %'
    or lower(line) like '%exists%'
    or lower(line) like '%if %'
    or lower(line) like '%raise%'
    or lower(line) like '%return%'
    or lower(line) like '%organization_members%'
    or lower(line) like '%player_devices%'
    or lower(line) like '%zones%'
  )
order by function_name, line_no;
