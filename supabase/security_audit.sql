-- LELVINE Supabase Security Audit (read-only)
-- Run in Supabase SQL Editor. This does not change any data or policies.

with app_tables as (
  select unnest(array[
    'organizations',
    'organization_members',
    'locations',
    'zones',
    'zone_schedules',
    'subscriptions',
    'channels',
    'tracks',
    'player_devices',
    'audit_events',
    'stripe_webhook_events'
  ]) as table_name
),
table_security as (
  select
    t.table_name,
    c.relrowsecurity as rls_enabled,
    c.relforcerowsecurity as force_rls
  from app_tables t
  left join pg_class c
    on c.relname = t.table_name
   and c.relnamespace = 'public'::regnamespace
),
policy_counts as (
  select
    tablename as table_name,
    count(*)::int as policy_count,
    string_agg(
      policyname || ' [' || cmd || '] roles=' || array_to_string(roles, ','),
      E'\n' order by policyname
    ) as policies
  from pg_policies
  where schemaname = 'public'
  group by tablename
),
grants as (
  select
    table_name,
    string_agg(
      grantee || ':' || privilege_type,
      ', ' order by grantee, privilege_type
    ) as exposed_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon','authenticated')
  group by table_name
)
select
  s.table_name,
  case
    when to_regclass('public.' || s.table_name) is null then 'MISSING'
    when s.rls_enabled then 'RLS ON'
    else 'RLS OFF'
  end as rls_status,
  coalesce(p.policy_count, 0) as policy_count,
  coalesce(g.exposed_grants, '') as anon_authenticated_grants,
  coalesce(p.policies, '') as policies,
  case
    when to_regclass('public.' || s.table_name) is null then 'CHECK'
    when not s.rls_enabled then 'CRITICAL'
    when coalesce(p.policy_count, 0) = 0
         and coalesce(g.exposed_grants, '') <> '' then 'HIGH'
    else 'REVIEW'
  end as audit_level
from table_security s
left join policy_counts p using (table_name)
left join grants g using (table_name)
order by
  case
    when to_regclass('public.' || s.table_name) is null then 3
    when not s.rls_enabled then 0
    when coalesce(p.policy_count, 0) = 0
         and coalesce(g.exposed_grants, '') <> '' then 1
    else 2
  end,
  s.table_name;

-- Helper-function audit: SECURITY DEFINER functions can bypass RLS,
-- so verify that only intended helper/RPC functions use it.
select
  n.nspname as schema_name,
  p.proname as function_name,
  p.prosecdef as security_definer,
  pg_get_userbyid(p.proowner) as owner,
  coalesce(array_to_string(p.proacl, E'\n'), '') as grants
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.prosecdef = true
    or p.proname in (
      'is_org_member',
      'has_org_role',
      'location_org_id',
      'zone_org_id',
      'claim_stripe_webhook_event',
      'complete_stripe_webhook_event',
      'fail_stripe_webhook_event'
    )
  )
order by p.prosecdef desc, p.proname;

-- Views audit: identify security-definer style views or views that expose app data.
select
  c.relname as view_name,
  c.relkind,
  pg_get_userbyid(c.relowner) as owner,
  coalesce(array_to_string(c.relacl, E'\n'), '') as grants
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('v','m')
  and c.relname in ('player_device_overview','zone_music_overview')
order by c.relname;
