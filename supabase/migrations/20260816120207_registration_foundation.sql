begin;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$function$;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  registration_code_prefix text,
  title text not null,
  subtitle text,
  event_type text not null,
  status text not null,
  short_description text not null,
  description text not null,
  city text not null,
  venue text,
  address text,
  timezone text not null,
  starts_at timestamptz,
  tentative_date date,
  date_status text,
  event_window_start time without time zone,
  event_window_end time without time zone,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  capacity integer not null,
  price_minor bigint,
  currency text not null,
  cover_image_path text,
  participant_note text,
  distance_selection_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_slug_key unique (slug),
  constraint events_registration_code_prefix_key unique (registration_code_prefix),
  constraint events_slug_not_blank_check check (btrim(slug) <> ''),
  constraint events_registration_code_prefix_not_blank_check check (
    registration_code_prefix is null or btrim(registration_code_prefix) <> ''
  ),
  constraint events_status_check check (
    status in ('draft', 'coming_soon', 'open', 'sold_out', 'closed', 'finished')
  ),
  constraint events_date_status_check check (
    date_status is null or date_status in ('tentative', 'confirmed')
  ),
  constraint events_date_consistency_check check (
    (
      date_status = 'tentative'
      and tentative_date is not null
      and starts_at is null
    )
    or (
      date_status = 'confirmed'
      and starts_at is not null
    )
    or (
      date_status is null
      and tentative_date is null
    )
  ),
  constraint events_open_date_check check (
    status <> 'open'
    or (date_status = 'confirmed' and starts_at is not null)
  ),
  constraint events_window_pair_check check (
    (event_window_start is null and event_window_end is null)
    or (event_window_start is not null and event_window_end is not null)
  ),
  constraint events_registration_window_check check (
    registration_opens_at is null
    or registration_closes_at is null
    or registration_closes_at > registration_opens_at
  ),
  constraint events_capacity_check check (capacity > 0),
  constraint events_price_minor_check check (price_minor is null or price_minor >= 0),
  constraint events_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint events_timezone_not_blank_check check (btrim(timezone) <> '')
);

create table public.event_distances (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  code text not null,
  title text not null,
  distance_meters integer not null,
  min_age smallint,
  max_age smallint,
  capacity integer,
  price_minor bigint,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_distances_event_id_fkey foreign key (event_id)
    references public.events (id) on delete cascade,
  constraint event_distances_event_code_key unique (event_id, code),
  constraint event_distances_event_id_id_key unique (event_id, id),
  constraint event_distances_code_not_blank_check check (btrim(code) <> ''),
  constraint event_distances_distance_meters_check check (distance_meters > 0),
  constraint event_distances_min_age_check check (min_age is null or min_age >= 0),
  constraint event_distances_max_age_check check (max_age is null or max_age >= 0),
  constraint event_distances_age_range_check check (
    min_age is null or max_age is null or min_age <= max_age
  ),
  constraint event_distances_capacity_check check (capacity is null or capacity > 0),
  constraint event_distances_price_minor_check check (price_minor is null or price_minor >= 0)
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  distance_id uuid not null,
  status text not null,
  public_id text,
  idempotency_key text not null,
  amount_minor bigint not null,
  currency text not null,
  reserved_at timestamptz not null default now(),
  reservation_expires_at timestamptz not null,
  flow_token_hash text not null,
  flow_token_expires_at timestamptz not null,
  payment_started_at timestamptz,
  confirmed_at timestamptz,
  expired_at timestamptz,
  cancelled_at timestamptz,
  check_in_token_hash text,
  kit_issued_at timestamptz,
  kit_issued_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registrations_event_id_fkey foreign key (event_id)
    references public.events (id) on delete restrict,
  constraint registrations_event_distance_fkey foreign key (event_id, distance_id)
    references public.event_distances (event_id, id) on delete restrict,
  constraint registrations_public_id_key unique (public_id),
  constraint registrations_idempotency_key_key unique (idempotency_key),
  constraint registrations_flow_token_hash_key unique (flow_token_hash),
  constraint registrations_check_in_token_hash_key unique (check_in_token_hash),
  constraint registrations_status_check check (
    status in ('pending_payment', 'confirmed', 'expired', 'cancelled')
  ),
  constraint registrations_public_id_not_blank_check check (
    public_id is null or btrim(public_id) <> ''
  ),
  constraint registrations_idempotency_key_not_blank_check check (btrim(idempotency_key) <> ''),
  constraint registrations_amount_minor_check check (amount_minor >= 0),
  constraint registrations_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint registrations_reservation_window_check check (
    reservation_expires_at > reserved_at
  ),
  constraint registrations_flow_token_expiry_check check (
    flow_token_expires_at > reserved_at
  ),
  constraint registrations_flow_token_hash_check check (
    flow_token_hash ~ '^[0-9A-Fa-f]{64}$'
  ),
  constraint registrations_check_in_token_hash_check check (
    check_in_token_hash is null or check_in_token_hash ~ '^[0-9A-Fa-f]{64}$'
  ),
  constraint registrations_confirmed_timestamp_check check (
    confirmed_at is null or status = 'confirmed'
  ),
  constraint registrations_expired_timestamp_check check (
    expired_at is null or status = 'expired'
  ),
  constraint registrations_cancelled_timestamp_check check (
    cancelled_at is null or status = 'cancelled'
  ),
  constraint registrations_kit_issuer_check check (
    kit_issued_by is null or kit_issued_at is not null
  )
);

create table public.children (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  last_name text not null,
  first_name text not null,
  middle_name text,
  last_name_normalized text not null,
  first_name_normalized text not null,
  birth_date date not null,
  gender text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint children_registration_id_fkey foreign key (registration_id)
    references public.registrations (id) on delete cascade,
  constraint children_registration_id_key unique (registration_id),
  constraint children_last_name_not_blank_check check (btrim(last_name) <> ''),
  constraint children_first_name_not_blank_check check (btrim(first_name) <> ''),
  constraint children_last_name_normalized_not_blank_check check (
    btrim(last_name_normalized) <> ''
  ),
  constraint children_first_name_normalized_not_blank_check check (
    btrim(first_name_normalized) <> ''
  ),
  constraint children_gender_check check (gender in ('male', 'female'))
);

create table public.parents (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  full_name text not null,
  phone_display text not null,
  phone_normalized text not null,
  email_display text not null,
  email_normalized text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parents_registration_id_fkey foreign key (registration_id)
    references public.registrations (id) on delete cascade,
  constraint parents_registration_id_key unique (registration_id),
  constraint parents_full_name_not_blank_check check (btrim(full_name) <> ''),
  constraint parents_phone_display_not_blank_check check (btrim(phone_display) <> ''),
  constraint parents_phone_normalized_not_blank_check check (btrim(phone_normalized) <> ''),
  constraint parents_email_display_not_blank_check check (btrim(email_display) <> ''),
  constraint parents_email_normalized_not_blank_check check (btrim(email_normalized) <> ''),
  constraint parents_email_normalized_lowercase_check check (
    email_normalized = lower(email_normalized)
  )
);

create table public.registration_documents (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  document_type text not null,
  storage_bucket text not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  is_current boolean not null default true,
  uploaded_at timestamptz not null default now(),
  verified_at timestamptz,
  replaced_at timestamptz,
  created_at timestamptz not null default now(),
  constraint registration_documents_registration_id_fkey foreign key (registration_id)
    references public.registrations (id) on delete restrict,
  constraint registration_documents_storage_path_key unique (storage_path),
  constraint registration_documents_document_type_check check (
    document_type = 'liability_waiver'
  ),
  constraint registration_documents_storage_bucket_check check (
    storage_bucket = 'registration-documents'
  ),
  constraint registration_documents_storage_path_not_blank_check check (
    btrim(storage_path) <> ''
  ),
  constraint registration_documents_original_filename_not_blank_check check (
    btrim(original_filename) <> ''
  ),
  constraint registration_documents_mime_type_check check (
    mime_type in ('application/pdf', 'image/jpeg', 'image/png')
  ),
  constraint registration_documents_size_bytes_check check (
    size_bytes > 0 and size_bytes <= 10485760
  )
);

create table public.registration_consents (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  consent_type text not null,
  consent_version text not null,
  accepted_at timestamptz not null default now(),
  document_hash text,
  created_at timestamptz not null default now(),
  constraint registration_consents_registration_id_fkey foreign key (registration_id)
    references public.registrations (id) on delete restrict,
  constraint registration_consents_registration_type_key unique (registration_id, consent_type),
  constraint registration_consents_consent_type_check check (
    consent_type in ('event_rules', 'personal_data', 'parent_responsibility')
  ),
  constraint registration_consents_consent_version_not_blank_check check (
    btrim(consent_version) <> ''
  )
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  provider text not null,
  provider_payment_id text,
  status text not null,
  amount_minor bigint not null,
  currency text not null,
  provider_created_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_registration_id_fkey foreign key (registration_id)
    references public.registrations (id) on delete restrict,
  constraint payments_provider_not_blank_check check (btrim(provider) <> ''),
  constraint payments_provider_payment_id_not_blank_check check (
    provider_payment_id is null or btrim(provider_payment_id) <> ''
  ),
  constraint payments_status_check check (
    status in ('pending', 'paid', 'failed', 'cancelled', 'refund_pending', 'refunded')
  ),
  constraint payments_amount_minor_check check (amount_minor >= 0),
  constraint payments_currency_check check (currency ~ '^[A-Z]{3}$')
);

create table public.event_partners (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  name text not null,
  logo_path text,
  website_url text,
  category text,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_partners_event_id_fkey foreign key (event_id)
    references public.events (id) on delete cascade,
  constraint event_partners_name_not_blank_check check (btrim(name) <> '')
);

create table public.event_kit_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  code text not null,
  name text not null,
  description text,
  image_path text,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_kit_items_event_id_fkey foreign key (event_id)
    references public.events (id) on delete cascade,
  constraint event_kit_items_event_code_key unique (event_id, code),
  constraint event_kit_items_code_not_blank_check check (btrim(code) <> ''),
  constraint event_kit_items_name_not_blank_check check (btrim(name) <> '')
);

create table public.event_registration_counters (
  event_id uuid primary key,
  last_public_number bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint event_registration_counters_event_id_fkey foreign key (event_id)
    references public.events (id) on delete cascade,
  constraint event_registration_counters_last_public_number_check check (
    last_public_number >= 0
  )
);

comment on column public.events.price_minor is
  'Provider-independent ISO-style minor units; never a floating-point amount.';
comment on column public.registrations.amount_minor is
  'Server-calculated price snapshot in ISO-style minor units.';
comment on column public.payments.amount_minor is
  'Expected provider-independent amount in ISO-style minor units.';
comment on column public.registrations.public_id is
  'Public reference only; it is not an authentication credential.';
comment on column public.registrations.flow_token_hash is
  'Lower- or uppercase hexadecimal SHA-256 hash; the raw flow token is never stored.';
comment on table public.registration_documents is
  'Metadata for private registration documents; file bytes remain in private Storage.';

create index events_status_starts_at_idx
  on public.events (status, starts_at);

create index event_distances_event_sort_order_idx
  on public.event_distances (event_id, sort_order);

create index registrations_event_capacity_idx
  on public.registrations (event_id, status, reservation_expires_at);

create index registrations_distance_capacity_idx
  on public.registrations (distance_id, status, reservation_expires_at);

create index children_name_birth_date_idx
  on public.children (last_name_normalized, first_name_normalized, birth_date);

create index parents_phone_normalized_idx
  on public.parents (phone_normalized);

create index parents_email_normalized_idx
  on public.parents (email_normalized);

create unique index registration_documents_current_type_key
  on public.registration_documents (registration_id, document_type)
  where is_current = true;

create index registration_documents_registration_id_idx
  on public.registration_documents (registration_id);

create unique index payments_provider_payment_id_key
  on public.payments (provider, provider_payment_id)
  where provider_payment_id is not null;

create index payments_registration_created_at_idx
  on public.payments (registration_id, created_at);

create index event_partners_event_sort_order_idx
  on public.event_partners (event_id, sort_order);

create index event_kit_items_event_sort_order_idx
  on public.event_kit_items (event_id, sort_order);

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create trigger event_distances_set_updated_at
before update on public.event_distances
for each row execute function public.set_updated_at();

create trigger registrations_set_updated_at
before update on public.registrations
for each row execute function public.set_updated_at();

create trigger children_set_updated_at
before update on public.children
for each row execute function public.set_updated_at();

create trigger parents_set_updated_at
before update on public.parents
for each row execute function public.set_updated_at();

create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

create trigger event_partners_set_updated_at
before update on public.event_partners
for each row execute function public.set_updated_at();

create trigger event_kit_items_set_updated_at
before update on public.event_kit_items
for each row execute function public.set_updated_at();

create trigger event_registration_counters_set_updated_at
before update on public.event_registration_counters
for each row execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.event_distances enable row level security;
alter table public.registrations enable row level security;
alter table public.children enable row level security;
alter table public.parents enable row level security;
alter table public.registration_documents enable row level security;
alter table public.registration_consents enable row level security;
alter table public.payments enable row level security;
alter table public.event_partners enable row level security;
alter table public.event_kit_items enable row level security;
alter table public.event_registration_counters enable row level security;

revoke all privileges on table
  public.events,
  public.event_distances,
  public.registrations,
  public.children,
  public.parents,
  public.registration_documents,
  public.registration_consents,
  public.payments,
  public.event_partners,
  public.event_kit_items,
  public.event_registration_counters
from public;

revoke all privileges on table
  public.events,
  public.event_distances,
  public.registrations,
  public.children,
  public.parents,
  public.registration_documents,
  public.registration_consents,
  public.payments,
  public.event_partners,
  public.event_kit_items,
  public.event_registration_counters
from anon, authenticated;

grant select, insert, update, delete on table
  public.events,
  public.event_distances,
  public.event_partners,
  public.event_kit_items,
  public.event_registration_counters
to service_role;

grant select, insert, update on table
  public.registrations,
  public.children,
  public.parents,
  public.registration_documents,
  public.registration_consents,
  public.payments
to service_role;

revoke all privileges on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'registration-documents',
  'registration-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
