-- LELVINE Stripe webhook idempotency
-- Run once in Supabase SQL Editor before relying on duplicate-safe webhook processing.

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  stripe_created_at timestamptz,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  attempt_count integer not null default 1,
  first_received_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text
);

create index if not exists stripe_webhook_events_status_idx
  on public.stripe_webhook_events (status, last_attempt_at desc);

alter table public.stripe_webhook_events enable row level security;

revoke all on table public.stripe_webhook_events from anon, authenticated;

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_stripe_created_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer := 0;
begin
  insert into public.stripe_webhook_events (
    event_id,
    event_type,
    stripe_created_at,
    status,
    attempt_count,
    first_received_at,
    last_attempt_at,
    processed_at,
    error_message
  )
  values (
    p_event_id,
    p_event_type,
    p_stripe_created_at,
    'processing',
    1,
    now(),
    now(),
    null,
    null
  )
  on conflict (event_id) do update
  set
    event_type = excluded.event_type,
    stripe_created_at = coalesce(excluded.stripe_created_at, stripe_webhook_events.stripe_created_at),
    status = 'processing',
    attempt_count = stripe_webhook_events.attempt_count + 1,
    last_attempt_at = now(),
    processed_at = null,
    error_message = null
  where
    stripe_webhook_events.status = 'failed'
    or (
      stripe_webhook_events.status = 'processing'
      and stripe_webhook_events.last_attempt_at < now() - interval '10 minutes'
    );

  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.complete_stripe_webhook_event(
  p_event_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.stripe_webhook_events
  set
    status = 'completed',
    processed_at = now(),
    last_attempt_at = now(),
    error_message = null
  where event_id = p_event_id
    and status = 'processing';
end;
$$;

create or replace function public.fail_stripe_webhook_event(
  p_event_id text,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.stripe_webhook_events
  set
    status = 'failed',
    processed_at = null,
    last_attempt_at = now(),
    error_message = left(coalesce(p_error_message, 'Unknown error'), 4000)
  where event_id = p_event_id;
end;
$$;

revoke all on function public.claim_stripe_webhook_event(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.complete_stripe_webhook_event(text) from public, anon, authenticated;
revoke all on function public.fail_stripe_webhook_event(text, text) from public, anon, authenticated;

grant execute on function public.claim_stripe_webhook_event(text, text, timestamptz) to service_role;
grant execute on function public.complete_stripe_webhook_event(text) to service_role;
grant execute on function public.fail_stripe_webhook_event(text, text) to service_role;

insert into public.audit_events (
  event_type,
  severity,
  title,
  detail,
  source,
  metadata
)
values (
  'system',
  'success',
  'Stripe webhook idempotency enabled',
  'Duplicate Stripe events are now claimed and processed once, with safe retries after failures.',
  'migration',
  jsonb_build_object('version', 1)
);
