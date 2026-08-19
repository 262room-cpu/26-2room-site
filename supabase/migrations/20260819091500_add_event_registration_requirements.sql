begin;

create table public.event_document_requirements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  document_type text not null,
  title text not null,
  description text,
  template_url text,
  required boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_document_requirements_event_id_fkey
    foreign key (event_id)
    references public.events (id)
    on delete cascade,

  constraint event_document_requirements_event_type_key
    unique (event_id, document_type),

  constraint event_document_requirements_document_type_not_blank_check
    check (btrim(document_type) <> ''),

  constraint event_document_requirements_title_not_blank_check
    check (btrim(title) <> ''),

  constraint event_document_requirements_template_url_not_blank_check
    check (template_url is null or btrim(template_url) <> '')
);

create table public.event_consent_requirements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  consent_type text not null,
  consent_version text not null,
  title text not null,
  body_text text not null,
  document_url text,
  required boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_consent_requirements_event_id_fkey
    foreign key (event_id)
    references public.events (id)
    on delete cascade,

  constraint event_consent_requirements_event_type_key
    unique (event_id, consent_type),

  constraint event_consent_requirements_consent_type_not_blank_check
    check (btrim(consent_type) <> ''),

  constraint event_consent_requirements_consent_version_not_blank_check
    check (btrim(consent_version) <> ''),

  constraint event_consent_requirements_title_not_blank_check
    check (btrim(title) <> ''),

  constraint event_consent_requirements_body_text_not_blank_check
    check (btrim(body_text) <> ''),

  constraint event_consent_requirements_document_url_not_blank_check
    check (document_url is null or btrim(document_url) <> '')
);

create index event_document_requirements_event_sort_idx
  on public.event_document_requirements (event_id, sort_order);

create index event_consent_requirements_event_sort_idx
  on public.event_consent_requirements (event_id, sort_order);

create trigger event_document_requirements_set_updated_at
before update on public.event_document_requirements
for each row execute function public.room262_set_updated_at();

create trigger event_consent_requirements_set_updated_at
before update on public.event_consent_requirements
for each row execute function public.room262_set_updated_at();

alter table public.event_document_requirements enable row level security;
alter table public.event_consent_requirements enable row level security;

revoke all privileges on table
  public.event_document_requirements,
  public.event_consent_requirements
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.event_document_requirements,
  public.event_consent_requirements
to service_role;

commit;