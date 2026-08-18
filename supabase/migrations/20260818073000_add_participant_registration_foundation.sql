begin;

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,

  last_name text not null,
  first_name text not null,
  middle_name text,

  last_name_normalized text not null,
  first_name_normalized text not null,

  birth_date date not null,
  gender text not null,

  phone_display text not null,
  phone_normalized text not null,

  email_display text not null,
  email_normalized text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint participants_registration_id_fkey
    foreign key (registration_id)
    references public.registrations (id)
    on delete cascade,

  constraint participants_registration_id_key
    unique (registration_id),

  constraint participants_last_name_not_blank_check
    check (btrim(last_name) <> ''),

  constraint participants_first_name_not_blank_check
    check (btrim(first_name) <> ''),

  constraint participants_last_name_normalized_not_blank_check
    check (btrim(last_name_normalized) <> ''),

  constraint participants_first_name_normalized_not_blank_check
    check (btrim(first_name_normalized) <> ''),

  constraint participants_gender_check
    check (gender in ('male', 'female')),

  constraint participants_phone_display_not_blank_check
    check (btrim(phone_display) <> ''),

  constraint participants_phone_normalized_not_blank_check
    check (btrim(phone_normalized) <> ''),

  constraint participants_email_display_not_blank_check
    check (btrim(email_display) <> ''),

  constraint participants_email_normalized_not_blank_check
    check (btrim(email_normalized) <> ''),

  constraint participants_email_normalized_lowercase_check
    check (email_normalized = lower(email_normalized))
);

create index participants_name_birth_date_idx
  on public.participants (
    last_name_normalized,
    first_name_normalized,
    birth_date
  );

create index participants_phone_normalized_idx
  on public.participants (phone_normalized);

create index participants_email_normalized_idx
  on public.participants (email_normalized);

create trigger participants_set_updated_at
before update on public.participants
for each row
execute function public.room262_set_updated_at();

alter table public.participants enable row level security;

revoke all privileges on table public.participants
from public;

revoke all privileges on table public.participants
from anon, authenticated;

grant select, insert, update on table public.participants
to service_role;


-- Document types are validated by the server/event configuration.
-- This allows Kids Run liability waivers, adult health declarations,
-- and future document types configured through the admin panel.

alter table public.registration_documents
drop constraint if exists registration_documents_document_type_check;

alter table public.registration_documents
add constraint registration_documents_document_type_check
check (btrim(document_type) <> '');


-- Consent types are also server/event-configured so future events
-- can define their own required consents without another schema migration.

alter table public.registration_consents
drop constraint if exists registration_consents_consent_type_check;

alter table public.registration_consents
add constraint registration_consents_consent_type_check
check (btrim(consent_type) <> '');

comment on table public.participants is
  'Participant data for self-registering participants, including adult race registrations.';

comment on column public.registration_documents.document_type is
  'Server-validated document type. Event configuration determines which document types are required.';

comment on column public.registration_consents.consent_type is
  'Server-validated consent type. Event configuration determines which consents are required.';

commit;