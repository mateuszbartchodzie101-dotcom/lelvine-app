-- LELVINE persistent audit log
-- Run once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null default 'system',
  severity text not null default 'info',
  title text not null,
  detail text,
  organization_id uuid,
  device_id uuid,
  actor_user_id uuid,
  actor_email text,
  source text not null default 'database',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_created_at_idx
  on public.audit_events (created_at desc);

create index if not exists audit_events_organization_idx
  on public.audit_events (organization_id, created_at desc);

create index if not exists audit_events_device_idx
  on public.audit_events (device_id, created_at desc);

create index if not exists audit_events_type_idx
  on public.audit_events (event_type, created_at desc);

alter table public.audit_events enable row level security;

revoke all on table public.audit_events from anon, authenticated;

create or replace function public.lelvine_audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  oldj jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  newj jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  org_id uuid;
  dev_id uuid;
  row_title text;
  row_detail text;
  severity_value text := 'info';
begin
  org_id := nullif(coalesce(newj->>'organization_id', oldj->>'organization_id'), '')::uuid;
  dev_id := nullif(coalesce(newj->>'device_id', newj->>'id', oldj->>'device_id', oldj->>'id'), '')::uuid;

  if tg_table_name = 'subscriptions' then
    row_title := case
      when tg_op = 'INSERT' then 'Subscription created'
      when tg_op = 'DELETE' then 'Subscription deleted'
      else 'Subscription updated'
    end;
    row_detail := 'Status: ' || coalesce(newj->>'status', oldj->>'status', 'unknown');
    if tg_op = 'DELETE' or coalesce(newj->>'status','') in ('canceled','unpaid','past_due') then
      severity_value := 'warning';
    end if;

  elsif tg_table_name = 'tracks' then
    row_title := case
      when tg_op = 'INSERT' then 'Track created'
      when tg_op = 'DELETE' then 'Track deleted'
      else 'Track updated'
    end;
    row_detail := coalesce(newj->>'title', oldj->>'title', 'Track');

  elsif tg_table_name = 'channels' then
    row_title := case
      when tg_op = 'INSERT' then 'Channel created'
      when tg_op = 'DELETE' then 'Channel deleted'
      else 'Channel updated'
    end;
    row_detail := coalesce(newj->>'name', oldj->>'name', 'Channel');

  elsif tg_table_name = 'player_devices' then
    if tg_op = 'INSERT' then
      row_title := 'Player created';
      row_detail := coalesce(newj->>'name', newj->>'device_name', 'Player');
    elsif tg_op = 'DELETE' then
      row_title := 'Player deleted';
      row_detail := coalesce(oldj->>'name', oldj->>'device_name', 'Player');
      severity_value := 'warning';
    elsif oldj->>'paired_at' is distinct from newj->>'paired_at'
      and newj->>'paired_at' is not null then
      row_title := 'Player paired';
      row_detail := coalesce(newj->>'name', newj->>'device_name', 'Player');
      severity_value := 'success';
    elsif oldj->>'current_channel_id' is distinct from newj->>'current_channel_id' then
      row_title := 'Player channel changed';
      row_detail := coalesce(newj->>'name', newj->>'device_name', 'Player');
    elsif oldj->>'playback_state' is distinct from newj->>'playback_state' then
      row_title := 'Playback state changed';
      row_detail := coalesce(newj->>'name', newj->>'device_name', 'Player')
        || ': ' || coalesce(oldj->>'playback_state','unknown')
        || ' → ' || coalesce(newj->>'playback_state','unknown');
    elsif oldj->>'last_error' is distinct from newj->>'last_error'
      and nullif(newj->>'last_error','') is not null then
      row_title := 'Playback error';
      row_detail := newj->>'last_error';
      severity_value := 'critical';
    elsif oldj->>'is_active' is distinct from newj->>'is_active' then
      row_title := 'Player active state changed';
      row_detail := coalesce(newj->>'name', newj->>'device_name', 'Player');
      severity_value := 'warning';
    else
      return new;
    end if;
  else
    return new;
  end if;

  insert into public.audit_events (
    event_type,
    severity,
    title,
    detail,
    organization_id,
    device_id,
    source,
    metadata
  )
  values (
    case
      when tg_table_name = 'player_devices' then 'player'
      when tg_table_name = 'subscriptions' then 'subscription'
      when tg_table_name in ('tracks','channels') then 'music'
      else 'system'
    end,
    severity_value,
    row_title,
    row_detail,
    org_id,
    case when tg_table_name = 'player_devices' then dev_id else null end,
    'database-trigger',
    jsonb_build_object(
      'table', tg_table_name,
      'operation', tg_op,
      'old', oldj,
      'new', newj
    )
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
begin
  if to_regclass('public.subscriptions') is not null then
    execute 'drop trigger if exists lel_vine_audit_subscriptions on public.subscriptions';
    execute 'create trigger lel_vine_audit_subscriptions after insert or update or delete on public.subscriptions for each row execute function public.lelvine_audit_row_change()';
  end if;

  if to_regclass('public.tracks') is not null then
    execute 'drop trigger if exists lel_vine_audit_tracks on public.tracks';
    execute 'create trigger lel_vine_audit_tracks after insert or update or delete on public.tracks for each row execute function public.lelvine_audit_row_change()';
  end if;

  if to_regclass('public.channels') is not null then
    execute 'drop trigger if exists lel_vine_audit_channels on public.channels';
    execute 'create trigger lel_vine_audit_channels after insert or update or delete on public.channels for each row execute function public.lelvine_audit_row_change()';
  end if;

  if to_regclass('public.player_devices') is not null then
    execute 'drop trigger if exists lel_vine_audit_player_devices on public.player_devices';
    execute 'create trigger lel_vine_audit_player_devices after insert or update or delete on public.player_devices for each row execute function public.lelvine_audit_row_change()';
  end if;
end
$$;

insert into public.audit_events (
  event_type, severity, title, detail, source, metadata
)
values (
  'system',
  'success',
  'Persistent audit log enabled',
  'LELVINE audit_events table and database triggers are active.',
  'migration',
  jsonb_build_object('version', 1)
);
