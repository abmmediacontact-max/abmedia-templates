-- =============================================================
--  ABMedia Story Builder · Esquema de Supabase
--  Pega TODO este bloque en: Supabase → SQL Editor → New query → Run
-- =============================================================

-- 1) Tabla de SECUENCIAS (cada usuario ve solo las suyas)
create table if not exists public.sequences (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references auth.users(id) on delete cascade,
  title      text not null default 'Secuencia',
  category   text not null default 'valor',
  status     text not null default 'draft',
  submitted  boolean not null default false,
  style      jsonb not null default '{}'::jsonb,
  slides     jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_owner_and_updated()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then new.owner := auth.uid(); end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sequences_owner on public.sequences;
create trigger trg_sequences_owner
  before insert or update on public.sequences
  for each row execute function public.set_owner_and_updated();

alter table public.sequences enable row level security;

drop policy if exists "seq_select_own"  on public.sequences;
drop policy if exists "seq_insert_own"  on public.sequences;
drop policy if exists "seq_update_own"  on public.sequences;
drop policy if exists "seq_delete_own"  on public.sequences;

create policy "seq_select_own" on public.sequences for select using (owner = auth.uid());
create policy "seq_insert_own" on public.sequences for insert with check (true);
create policy "seq_update_own" on public.sequences for update using (owner = auth.uid());
create policy "seq_delete_own" on public.sequences for delete using (owner = auth.uid());


-- 2) Tabla de PLANTILLAS (privada del usuario + pública si is_public=true)
create table if not exists public.templates (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references auth.users(id) on delete cascade,
  title      text not null default 'Plantilla',
  category   text not null default 'valor',
  style      jsonb not null default '{}'::jsonb,
  slides     jsonb not null default '[]'::jsonb,
  submitted  boolean not null default false,
  is_public  boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.set_owner_tpl()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then new.owner := auth.uid(); end if;
  return new;
end;
$$;

drop trigger if exists trg_templates_owner on public.templates;
create trigger trg_templates_owner
  before insert on public.templates
  for each row execute function public.set_owner_tpl();

alter table public.templates enable row level security;

-- ADMIN: lista de emails autorizados. Cambia el correo si quieres.
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select lower(coalesce((auth.jwt() ->> 'email'),'')) = ANY (
    ARRAY['abmmediacontact@gmail.com']
  );
$$;

drop policy if exists "tpl_select"  on public.templates;
drop policy if exists "tpl_insert"  on public.templates;
drop policy if exists "tpl_update"  on public.templates;
drop policy if exists "tpl_delete"  on public.templates;

-- Ves: las tuyas, las públicas, o todas si eres admin
create policy "tpl_select" on public.templates for select
  using (owner = auth.uid() or is_public = true or public.is_admin());

create policy "tpl_insert" on public.templates for insert with check (true);

-- Puedes actualizar las tuyas; admin puede aprobar cualquiera
create policy "tpl_update" on public.templates for update
  using (owner = auth.uid() or public.is_admin());

create policy "tpl_delete" on public.templates for delete
  using (owner = auth.uid() or public.is_admin());
