begin;

create table if not exists public.event_kit_catalog_items (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  image_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_kit_catalog_items_code_key unique (code),
  constraint event_kit_catalog_items_code_not_blank_check
    check (btrim(code) <> ''),
  constraint event_kit_catalog_items_name_not_blank_check
    check (btrim(name) <> '')
);

alter table public.event_kit_items
  add column if not exists catalog_item_id uuid;

insert into public.event_kit_catalog_items (
  code,
  name,
  description,
  image_path,
  active,
  created_at,
  updated_at
)
select distinct on (kit.code)
  kit.code,
  kit.name,
  kit.description,
  kit.image_path,
  true,
  kit.created_at,
  kit.updated_at
from public.event_kit_items as kit
order by kit.code, kit.created_at, kit.id
on conflict (code) do nothing;

update public.event_kit_items as kit
set catalog_item_id = catalog.id
from public.event_kit_catalog_items as catalog
where kit.catalog_item_id is null
  and catalog.code = kit.code;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'event_kit_items_catalog_item_id_fkey'
      and conrelid = 'public.event_kit_items'::regclass
  ) then
    alter table public.event_kit_items
      add constraint event_kit_items_catalog_item_id_fkey
      foreign key (catalog_item_id)
      references public.event_kit_catalog_items (id)
      on delete restrict;
  end if;
end;
$$;

alter table public.event_kit_items
  alter column catalog_item_id set not null;

create unique index if not exists event_kit_items_event_catalog_key
  on public.event_kit_items (event_id, catalog_item_id);

create index if not exists event_kit_catalog_items_active_name_idx
  on public.event_kit_catalog_items (active, name);

create or replace function public.room262_sync_event_kit_item_from_catalog()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  catalog public.event_kit_catalog_items%rowtype;
begin
  select item.*
  into catalog
  from public.event_kit_catalog_items as item
  where item.id = new.catalog_item_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'kit_catalog_item_not_found';
  end if;

  new.code := catalog.code;
  new.name := catalog.name;
  new.description := catalog.description;
  new.image_path := catalog.image_path;

  return new;
end;
$$;

create or replace function public.room262_propagate_kit_catalog_item()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.event_kit_items
  set
    code = new.code,
    name = new.name,
    description = new.description,
    image_path = new.image_path
  where catalog_item_id = new.id;

  return new;
end;
$$;

drop trigger if exists event_kit_items_sync_catalog
  on public.event_kit_items;

create trigger event_kit_items_sync_catalog
before insert or update of catalog_item_id
on public.event_kit_items
for each row
execute function public.room262_sync_event_kit_item_from_catalog();

drop trigger if exists event_kit_catalog_items_propagate
  on public.event_kit_catalog_items;

create trigger event_kit_catalog_items_propagate
after update of code, name, description, image_path
on public.event_kit_catalog_items
for each row
when (
  old.code is distinct from new.code
  or old.name is distinct from new.name
  or old.description is distinct from new.description
  or old.image_path is distinct from new.image_path
)
execute function public.room262_propagate_kit_catalog_item();

drop trigger if exists event_kit_catalog_items_set_updated_at
  on public.event_kit_catalog_items;

create trigger event_kit_catalog_items_set_updated_at
before update on public.event_kit_catalog_items
for each row
execute function public.room262_set_updated_at();

alter table public.event_kit_catalog_items enable row level security;

revoke all privileges on table public.event_kit_catalog_items
from public, anon, authenticated;

grant select, insert, update, delete
on table public.event_kit_catalog_items
to service_role;

revoke all privileges on function
  public.room262_sync_event_kit_item_from_catalog(),
  public.room262_propagate_kit_catalog_item()
from public, anon, authenticated;

grant execute on function
  public.room262_sync_event_kit_item_from_catalog(),
  public.room262_propagate_kit_catalog_item()
to service_role;

comment on table public.event_kit_catalog_items is
  'Reusable starter-kit catalog; event_kit_items stores per-event membership and order.';

comment on column public.event_kit_items.catalog_item_id is
  'Global catalog item selected for this event. Legacy display columns stay synchronized for API compatibility.';

commit;
