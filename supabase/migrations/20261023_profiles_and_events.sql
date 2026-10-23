-- Applied to the "Thaana Font" Supabase project on 2026-10-23.
-- People: one row per account, filled automatically on sign-up. Admin-only notes and tags will live in a separate table later.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  marketing_ok boolean not null default false
);
alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid());

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, created_at) values (new.id, new.email, new.created_at) on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

insert into public.profiles (id, email, created_at) select id, email, created_at from auth.users on conflict (id) do nothing;

-- Usage: counts of what people do. Never letter shapes, photos or file contents.
create table public.events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  anon_id text,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  constraint events_name_ok check (name in ('visit','signup','login','font_started','import_svg','backup_saved','download_ttf','download_woff2','download_zip')),
  constraint events_anon_ok check (anon_id is null or length(anon_id) <= 64),
  constraint events_props_ok check (pg_column_size(props) <= 1024)
);
create index events_created_idx on public.events (created_at desc);
create index events_name_idx on public.events (name, created_at desc);
create index events_user_idx on public.events (user_id, created_at desc);
alter table public.events enable row level security;
-- Anyone can add a row about themselves; nobody can read, change or delete rows from the site.
create policy "add own events" on public.events for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
revoke all on public.events from anon, authenticated;
grant insert on public.events to anon, authenticated;
