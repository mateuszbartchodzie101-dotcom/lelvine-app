-- LELVINE targeted SECURITY DEFINER audit (read-only)
-- Run in Supabase SQL Editor. This does not change any functions or permissions.

select
  n.nspname as schema_name,
  p.proname as function_name,
  p.prosecdef as security_definer,
  pg_get_userbyid(p.proowner) as owner,
  coalesce(array_to_string(p.proacl, E'\n'), '') as grants,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'add_org_owner_membership',
    'create_player_device',
    'device_org_id',
    'has_org_role',
    'is_org_member',
    'location_org_id',
    'zone_org_id'
  )
order by p.proname;
