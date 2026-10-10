-- LELVINE SECURITY DEFINER risk summary (read-only)
-- Run in Supabase SQL Editor. This does not change anything.

with funcs as (
  select
    p.oid,
    p.proname as function_name,
    p.prosecdef as security_definer,
    coalesce(array_to_string(p.proacl, ' '), '') as grants,
    lower(pg_get_functiondef(p.oid)) as def
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
)
select
  function_name,
  security_definer,
  (grants like '%anon=X%') as executable_by_anon,
  (grants like '%authenticated=X%') as executable_by_authenticated,
  (def like '%auth.uid()%') as checks_auth_uid,
  (
    def like '%organization_members%'
    or def like '%is_org_member(%'
    or def like '%has_org_role(%'
  ) as checks_membership_or_role,
  (
    def like '%insert into%'
    or def like '%update %'
    or def like '%delete from%'
  ) as writes_data,
  (
    def like '%set search_path%'
    or def like '%set_config(%search_path%'
  ) as has_safe_search_path_setting,
  case
    when not security_definer then 'LOW'
    when grants like '%anon=X%'
         and (
           def like '%insert into%'
           or def like '%update %'
           or def like '%delete from%'
         )
         and def not like '%auth.uid()%'
      then 'CRITICAL'
    when grants like '%anon=X%'
         and (
           def like '%insert into%'
           or def like '%update %'
           or def like '%delete from%'
         )
      then 'HIGH'
    when grants like '%authenticated=X%'
         and (
           def like '%insert into%'
           or def like '%update %'
           or def like '%delete from%'
         )
         and def not like '%auth.uid()%'
      then 'HIGH'
    when security_definer
         and not (
           def like '%set search_path%'
           or def like '%set_config(%search_path%'
         )
      then 'MEDIUM'
    else 'REVIEW'
  end as risk
from funcs
order by
  case
    when grants like '%anon=X%'
         and (
           def like '%insert into%'
           or def like '%update %'
           or def like '%delete from%'
         )
         and def not like '%auth.uid()%' then 0
    when grants like '%anon=X%'
         and (
           def like '%insert into%'
           or def like '%update %'
           or def like '%delete from%'
         ) then 1
    when grants like '%authenticated=X%'
         and (
           def like '%insert into%'
           or def like '%update %'
           or def like '%delete from%'
         )
         and def not like '%auth.uid()%' then 2
    else 3
  end,
  function_name;
