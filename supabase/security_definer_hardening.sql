-- LELVINE hardening for flagged SECURITY DEFINER functions
-- Safe permission-only migration. Does not change function logic.

begin;

-- Trigger-only helper: users never need to call this directly.
revoke all on function public.add_org_owner_membership() from public;
revoke all on function public.add_org_owner_membership() from anon;
revoke all on function public.add_org_owner_membership() from authenticated;

-- Player creation RPC:
-- keep it available to signed-in users only.
revoke all on function public.create_player_device(uuid, text) from public;
revoke all on function public.create_player_device(uuid, text) from anon;
grant execute on function public.create_player_device(uuid, text) to authenticated;
grant execute on function public.create_player_device(uuid, text) to service_role;

commit;

-- Verification
select
  p.proname as function_name,
  coalesce(array_to_string(p.proacl, E'\n'), '') as grants
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('add_org_owner_membership','create_player_device')
order by p.proname;
