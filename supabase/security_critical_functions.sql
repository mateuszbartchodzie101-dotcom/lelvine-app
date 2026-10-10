-- LELVINE targeted audit for the two flagged functions (read-only)
-- Run in Supabase SQL Editor. This does not change anything.

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) as definition,
  coalesce(array_to_string(p.proacl, E'\n'), '') as grants
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('add_org_owner_membership','create_player_device')
order by p.proname;
