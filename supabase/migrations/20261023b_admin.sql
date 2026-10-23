-- Admin layer. Applied to the "Thaana Font" Supabase project on 2026-10-23.
-- Nothing here is readable from the site except through functions that check public.is_admin().

alter table public.profiles add column unsub_token uuid not null default gen_random_uuid();

create table public.admins (user_id uuid primary key references auth.users (id) on delete cascade);
alter table public.admins enable row level security;
insert into public.admins (user_id) select id from auth.users where email = 'hshazil@gmail.com';

create table public.profile_notes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text not null default '' check (length(note) <= 2000),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  updated_at timestamptz not null default now()
);
alter table public.profile_notes enable row level security;

create table public.sent_emails (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  subject text not null,
  body text not null,
  audience text not null,
  recipients int not null,
  sent_by uuid references auth.users (id) on delete set null
);
alter table public.sent_emails enable row level security;

create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

-- Everyone with stats, filtered. Internal: not callable from the site.
create function public._people(p_filter text) returns table (
  id uuid, email text, joined timestamptz, last_seen timestamptz, fonts int, downloads int,
  marketing_ok boolean, tags text[], note text, unsub_token uuid
) language sql stable security definer set search_path = '' as $$
  with base as (
    select p.id, p.email, p.created_at as joined,
      (select max(e.created_at) from public.events e where e.user_id = p.id) as last_seen,
      (select count(*) from public.events e where e.user_id = p.id and e.name = 'font_started')::int as fonts,
      (select count(*) from public.events e where e.user_id = p.id and e.name like 'download\_%')::int as downloads,
      p.marketing_ok, coalesce(n.tags, '{}') as tags, coalesce(n.note, '') as note, p.unsub_token
    from public.profiles p left join public.profile_notes n on n.user_id = p.id
  )
  select * from base where case p_filter
    when 'no_download' then fonts > 0 and downloads = 0
    when 'downloaded' then downloads > 0
    when 'opted_in' then marketing_ok
    when 'inactive' then coalesce(last_seen, joined) < now() - interval '14 days'
    else true end
$$;

create function public.admin_people(p_search text default '', p_filter text default 'all', p_limit int default 100, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  with f as (
    select x.*, row_number() over (order by x.joined desc) as rn from public._people(p_filter) x
    where coalesce(p_search, '') = '' or x.email ilike '%' || p_search || '%' or x.note ilike '%' || p_search || '%'
      or exists (select 1 from unnest(x.tags) t where t ilike '%' || p_search || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'email', email, 'joined', joined, 'last_seen', last_seen,
      'fonts', fonts, 'downloads', downloads, 'marketing_ok', marketing_ok, 'tags', tags, 'note', note) order by joined desc)
      from f where rn > p_offset and rn <= p_offset + p_limit), '[]'::jsonb)
  ) into r;
  return r;
end $$;

create function public.admin_person_events(p_id uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('name', name, 'props', props, 'at', created_at) order by created_at desc)
    from (select * from public.events where user_id = p_id order by created_at desc limit 25) e), '[]'::jsonb);
end $$;

create function public.admin_set_note(p_id uuid, p_note text, p_tags text[]) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into public.profile_notes (user_id, note, tags, updated_at)
  values (p_id, left(coalesce(p_note, ''), 2000), coalesce((select array_agg(left(t, 30)) from (select distinct trim(t) as t from unnest(p_tags) t where trim(t) <> '' limit 10) s), '{}'), now())
  on conflict (user_id) do update set note = excluded.note, tags = excluded.tags, updated_at = now();
end $$;

create function public.admin_overview(p_days int default 7) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  since timestamptz := case when p_days is null then '-infinity' else now() - make_interval(days => p_days) end;
  prev timestamptz := case when p_days is null then '-infinity' else now() - make_interval(days => p_days * 2) end;
  n int := case when p_days is null then 30 when p_days < 7 then 7 else least(p_days, 30) end;
  today date := (now() at time zone 'Indian/Maldives')::date;
  r jsonb;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  select jsonb_build_object(
    'visits', (select count(*) from public.events where name = 'visit' and created_at >= since),
    'visits_prev', case when p_days is null then null else (select count(*) from public.events where name = 'visit' and created_at >= prev and created_at < since) end,
    'signups', (select count(*) from public.profiles where created_at >= since),
    'signups_prev', case when p_days is null then null else (select count(*) from public.profiles where created_at >= prev and created_at < since) end,
    'started', (select count(*) from public.events where name = 'font_started' and created_at >= since),
    'downloads', (select count(*) from public.events where name like 'download\_%' and created_at >= since),
    'active_week', (select count(distinct user_id) from public.events where user_id is not null and created_at >= now() - interval '7 days'),
    'by_path', jsonb_build_object(
      'photo', (select count(*) from public.events where name = 'font_started' and props->>'path' = 'photo' and created_at >= since),
      'draw', (select count(*) from public.events where name = 'font_started' and props->>'path' = 'draw' and created_at >= since),
      'svg', (select count(*) from public.events where name = 'import_svg' and created_at >= since)),
    'by_format', jsonb_build_object(
      'ttf', (select count(*) from public.events where name = 'download_ttf' and created_at >= since),
      'woff2', (select count(*) from public.events where name = 'download_woff2' and created_at >= since),
      'zip', (select count(*) from public.events where name = 'download_zip' and created_at >= since)),
    'avg_letters', (select round(avg((props->>'letters')::numeric)) from public.events where name like 'download\_%' and props ? 'letters' and created_at >= since),
    'daily', (select jsonb_agg(jsonb_build_object('day', d, 'n', (select count(*) from public.profiles p where (p.created_at at time zone 'Indian/Maldives')::date = d)) order by d)
      from (select today - (n - 1) + i as d from generate_series(0, n - 1) i) s)
  ) into r;
  return r;
end $$;

create function public.admin_audience(p_filter text default 'all') returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  select jsonb_build_object('count', count(*), 'rows', coalesce(jsonb_agg(jsonb_build_object('id', id, 'email', email, 'token', unsub_token)), '[]'::jsonb))
  into r from public._people(p_filter) where marketing_ok and email is not null;
  return r;
end $$;

create function public.admin_log_email(p_subject text, p_body text, p_audience text, p_count int) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into public.sent_emails (subject, body, audience, recipients, sent_by) values (p_subject, p_body, p_audience, p_count, auth.uid());
end $$;

create function public.admin_sent_emails() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'subject', subject, 'audience', audience, 'recipients', recipients, 'at', created_at) order by created_at desc)
    from (select * from public.sent_emails order by created_at desc limit 50) s), '[]'::jsonb);
end $$;

-- People can turn updates on or off for themselves, and unsubscribe from an email link.
create function public.set_marketing_ok(p boolean) returns void language sql security definer set search_path = '' as $$
  update public.profiles set marketing_ok = p where id = auth.uid()
$$;

create function public.unsubscribe(p_id uuid, p_token uuid) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set marketing_ok = false where id = p_id and unsub_token = p_token;
  return found;
end $$;

-- Who may call what.
revoke all on function public._people(text) from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.admin_people(text, text, int, int) from public, anon;
revoke all on function public.admin_person_events(uuid) from public, anon;
revoke all on function public.admin_set_note(uuid, text, text[]) from public, anon;
revoke all on function public.admin_overview(int) from public, anon;
revoke all on function public.admin_audience(text) from public, anon;
revoke all on function public.admin_log_email(text, text, text, int) from public, anon;
revoke all on function public.admin_sent_emails() from public, anon;
revoke all on function public.set_marketing_ok(boolean) from public, anon;
revoke all on function public.unsubscribe(uuid, uuid) from public;
grant execute on function public.is_admin(), public.admin_people(text, text, int, int), public.admin_person_events(uuid),
  public.admin_set_note(uuid, text, text[]), public.admin_overview(int), public.admin_audience(text),
  public.admin_log_email(text, text, text, int), public.admin_sent_emails(), public.set_marketing_ok(boolean) to authenticated;
grant execute on function public.unsubscribe(uuid, uuid) to anon, authenticated;
