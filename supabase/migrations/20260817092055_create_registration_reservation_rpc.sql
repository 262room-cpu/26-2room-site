begin;

create function public.room262_create_registration_reservation(
  p_event_slug text,
  p_distance_code text,
  p_child_last_name text,
  p_child_first_name text,
  p_child_middle_name text,
  p_child_birth_date date,
  p_child_gender text,
  p_parent_full_name text,
  p_parent_phone text,
  p_parent_email text,
  p_idempotency_key text,
  p_flow_token_hash text,
  p_event_rules_consent_version text,
  p_personal_data_consent_version text,
  p_parent_responsibility_consent_version text
)
returns table (
  registration_id uuid,
  status text,
  reservation_expires_at timestamptz,
  amount_minor bigint,
  currency text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event_slug text;
  v_distance_code text;
  v_idempotency_key text;
  v_flow_token_hash text;
  v_child_last_name text;
  v_child_first_name text;
  v_child_middle_name text;
  v_child_gender text;
  v_parent_full_name text;
  v_parent_phone_display text;
  v_parent_phone_normalized text;
  v_parent_email_display text;
  v_parent_email_normalized text;
  v_event_rules_consent_version text;
  v_personal_data_consent_version text;
  v_parent_responsibility_consent_version text;

  v_event_id uuid;
  v_event_status text;
  v_event_date_status text;
  v_event_starts_at timestamptz;
  v_event_timezone text;
  v_registration_opens_at timestamptz;
  v_registration_closes_at timestamptz;
  v_event_capacity integer;
  v_event_price_minor bigint;
  v_event_currency text;

  v_distance_id uuid;
  v_distance_capacity integer;
  v_distance_price_minor bigint;
  v_distance_min_age integer;
  v_distance_max_age integer;

  v_existing_registration_id uuid;
  v_existing_event_id uuid;
  v_existing_status text;
  v_existing_reservation_expires_at timestamptz;
  v_existing_amount_minor bigint;
  v_existing_currency text;
  v_existing_flow_token_hash text;

  v_event_occupied bigint;
  v_distance_occupied bigint;
  v_amount_minor bigint;
  v_reserved_at timestamptz;
  v_reservation_expires_at timestamptz;
  v_event_local_date date;
  v_child_age_years integer;
  v_registration_id uuid;
  v_registration_status text;
begin
  v_event_slug := pg_catalog.btrim(p_event_slug);
  v_distance_code := pg_catalog.btrim(p_distance_code);
  v_idempotency_key := pg_catalog.btrim(p_idempotency_key);

  if v_event_slug is null or v_event_slug = '' then
    raise exception using
      errcode = 'P0001',
      message = 'event_not_found';
  end if;

  if v_idempotency_key is null or v_idempotency_key = '' then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_request';
  end if;

  if p_flow_token_hash is null or p_flow_token_hash !~ '^[0-9A-Fa-f]{64}$' then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_flow_token_hash';
  end if;

  v_flow_token_hash := pg_catalog.lower(p_flow_token_hash);

  select
    e.id,
    e.status,
    e.date_status,
    e.starts_at,
    e.timezone,
    e.registration_opens_at,
    e.registration_closes_at,
    e.capacity,
    e.price_minor,
    e.currency
  into
    v_event_id,
    v_event_status,
    v_event_date_status,
    v_event_starts_at,
    v_event_timezone,
    v_registration_opens_at,
    v_registration_closes_at,
    v_event_capacity,
    v_event_price_minor,
    v_event_currency
  from public.events as e
  where e.slug = v_event_slug
  for update of e;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'event_not_found';
  end if;

  select
    r.id,
    r.event_id,
    r.status,
    r.reservation_expires_at,
    r.amount_minor,
    r.currency,
    r.flow_token_hash
  into
    v_existing_registration_id,
    v_existing_event_id,
    v_existing_status,
    v_existing_reservation_expires_at,
    v_existing_amount_minor,
    v_existing_currency,
    v_existing_flow_token_hash
  from public.registrations as r
  where r.idempotency_key = v_idempotency_key
  for update of r;

  if found then
    if
      v_existing_event_id <> v_event_id
      or v_existing_flow_token_hash is distinct from v_flow_token_hash
    then
      raise exception using
        errcode = 'P0001',
        message = 'idempotency_conflict';
    end if;

    return query
    select
      v_existing_registration_id,
      v_existing_status,
      v_existing_reservation_expires_at,
      v_existing_amount_minor,
      v_existing_currency;
    return;
  end if;

  v_reserved_at := pg_catalog.clock_timestamp();

  if v_event_status <> 'open' then
    raise exception using
      errcode = 'P0001',
      message = 'event_not_open';
  end if;

  if v_event_date_status is distinct from 'confirmed' or v_event_starts_at is null then
    raise exception using
      errcode = 'P0001',
      message = 'event_date_not_confirmed';
  end if;

  if v_registration_opens_at is not null and v_reserved_at < v_registration_opens_at then
    raise exception using
      errcode = 'P0001',
      message = 'registration_not_started';
  end if;

  if v_registration_closes_at is not null and v_reserved_at >= v_registration_closes_at then
    raise exception using
      errcode = 'P0001',
      message = 'registration_closed';
  end if;

  if
    v_event_timezone is null
    or pg_catalog.btrim(v_event_timezone) = ''
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names as tz
      where tz.name = v_event_timezone
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_event_config';
  end if;

  select
    d.id,
    d.capacity,
    d.price_minor,
    d.min_age,
    d.max_age
  into
    v_distance_id,
    v_distance_capacity,
    v_distance_price_minor,
    v_distance_min_age,
    v_distance_max_age
  from public.event_distances as d
  where d.event_id = v_event_id
    and d.code = v_distance_code
  for update of d;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'distance_not_found';
  end if;

  v_amount_minor := coalesce(v_distance_price_minor, v_event_price_minor);

  if
    v_amount_minor is null
    or v_amount_minor < 0
    or v_event_currency is null
    or v_event_currency !~ '^[A-Z]{3}$'
  then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_price_config';
  end if;

  v_child_last_name := pg_catalog.btrim(p_child_last_name);
  v_child_first_name := pg_catalog.btrim(p_child_first_name);
  v_child_middle_name := nullif(pg_catalog.btrim(p_child_middle_name), '');
  v_child_gender := pg_catalog.lower(pg_catalog.btrim(p_child_gender));
  v_parent_full_name := pg_catalog.btrim(p_parent_full_name);
  v_parent_phone_display := pg_catalog.btrim(p_parent_phone);
  v_parent_phone_normalized := pg_catalog.regexp_replace(
    v_parent_phone_display,
    '[^0-9]+',
    '',
    'g'
  );
  v_parent_email_display := pg_catalog.btrim(p_parent_email);
  v_parent_email_normalized := pg_catalog.lower(v_parent_email_display);
  v_event_rules_consent_version := pg_catalog.btrim(p_event_rules_consent_version);
  v_personal_data_consent_version := pg_catalog.btrim(p_personal_data_consent_version);
  v_parent_responsibility_consent_version := pg_catalog.btrim(
    p_parent_responsibility_consent_version
  );

  if
    v_child_last_name is null
    or v_child_last_name = ''
    or v_child_first_name is null
    or v_child_first_name = ''
    or p_child_birth_date is null
    or v_child_gender is null
    or v_child_gender not in ('male', 'female')
    or v_parent_full_name is null
    or v_parent_full_name = ''
    or v_parent_phone_display is null
    or v_parent_phone_display = ''
    or v_parent_phone_normalized = ''
    or v_parent_email_display is null
    or v_parent_email_display = ''
    or v_event_rules_consent_version is null
    or v_event_rules_consent_version = ''
    or v_personal_data_consent_version is null
    or v_personal_data_consent_version = ''
    or v_parent_responsibility_consent_version is null
    or v_parent_responsibility_consent_version = ''
  then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_request';
  end if;

  v_event_local_date := (v_event_starts_at at time zone v_event_timezone)::date;

  if p_child_birth_date > v_event_local_date then
    raise exception using
      errcode = 'P0001',
      message = 'invalid_request';
  end if;

  v_child_age_years := pg_catalog.date_part(
    'year',
    pg_catalog.age(v_event_local_date::timestamp, p_child_birth_date::timestamp)
  )::integer;

  if
    (v_distance_min_age is not null and v_child_age_years < v_distance_min_age)
    or (v_distance_max_age is not null and v_child_age_years > v_distance_max_age)
  then
    raise exception using
      errcode = 'P0001',
      message = 'age_not_allowed';
  end if;

  if exists (
    select 1
    from public.registrations as r
    where r.flow_token_hash = v_flow_token_hash
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'flow_token_conflict';
  end if;

  v_reservation_expires_at := v_reserved_at + interval '15 minutes';

  select pg_catalog.count(*)
  into v_event_occupied
  from public.registrations as r
  where r.event_id = v_event_id
    and (
      r.status = 'confirmed'
      or (
        r.status = 'pending_payment'
        and r.reservation_expires_at > v_reserved_at
      )
    );

  if v_event_capacity is not null and v_event_occupied >= v_event_capacity then
    raise exception using
      errcode = 'P0001',
      message = 'sold_out';
  end if;

  if v_distance_capacity is not null then
    select pg_catalog.count(*)
    into v_distance_occupied
    from public.registrations as r
    where r.event_id = v_event_id
      and r.distance_id = v_distance_id
      and (
        r.status = 'confirmed'
        or (
          r.status = 'pending_payment'
          and r.reservation_expires_at > v_reserved_at
        )
      );

    if v_distance_occupied >= v_distance_capacity then
      raise exception using
        errcode = 'P0001',
        message = 'sold_out';
    end if;
  end if;

  begin
    insert into public.registrations as inserted (
      event_id,
      distance_id,
      status,
      idempotency_key,
      amount_minor,
      currency,
      reserved_at,
      reservation_expires_at,
      flow_token_hash,
      flow_token_expires_at
    )
    values (
      v_event_id,
      v_distance_id,
      'pending_payment',
      v_idempotency_key,
      v_amount_minor,
      v_event_currency,
      v_reserved_at,
      v_reservation_expires_at,
      v_flow_token_hash,
      v_reservation_expires_at
    )
    returning
      inserted.id,
      inserted.status
    into
      v_registration_id,
      v_registration_status;
  exception
    when unique_violation then
      select
        r.id,
        r.event_id,
        r.status,
        r.reservation_expires_at,
        r.amount_minor,
        r.currency,
        r.flow_token_hash
      into
        v_existing_registration_id,
        v_existing_event_id,
        v_existing_status,
        v_existing_reservation_expires_at,
        v_existing_amount_minor,
        v_existing_currency,
        v_existing_flow_token_hash
      from public.registrations as r
      where r.idempotency_key = v_idempotency_key;

      if found then
        if
          v_existing_event_id <> v_event_id
          or v_existing_flow_token_hash is distinct from v_flow_token_hash
        then
          raise exception using
            errcode = 'P0001',
            message = 'idempotency_conflict';
        end if;

        return query
        select
          v_existing_registration_id,
          v_existing_status,
          v_existing_reservation_expires_at,
          v_existing_amount_minor,
          v_existing_currency;
        return;
      end if;

      raise exception using
        errcode = 'P0001',
        message = 'flow_token_conflict';
  end;

  insert into public.children (
    registration_id,
    last_name,
    first_name,
    middle_name,
    last_name_normalized,
    first_name_normalized,
    birth_date,
    gender
  )
  values (
    v_registration_id,
    v_child_last_name,
    v_child_first_name,
    v_child_middle_name,
    pg_catalog.lower(v_child_last_name),
    pg_catalog.lower(v_child_first_name),
    p_child_birth_date,
    v_child_gender
  );

  insert into public.parents (
    registration_id,
    full_name,
    phone_display,
    phone_normalized,
    email_display,
    email_normalized
  )
  values (
    v_registration_id,
    v_parent_full_name,
    v_parent_phone_display,
    v_parent_phone_normalized,
    v_parent_email_display,
    v_parent_email_normalized
  );

  insert into public.registration_consents (
    registration_id,
    consent_type,
    consent_version,
    accepted_at
  )
  values
    (
      v_registration_id,
      'event_rules',
      v_event_rules_consent_version,
      v_reserved_at
    ),
    (
      v_registration_id,
      'personal_data',
      v_personal_data_consent_version,
      v_reserved_at
    ),
    (
      v_registration_id,
      'parent_responsibility',
      v_parent_responsibility_consent_version,
      v_reserved_at
    );

  return query
  select
    v_registration_id,
    v_registration_status,
    v_reservation_expires_at,
    v_amount_minor,
    v_event_currency;
end;
$function$;

comment on function public.room262_create_registration_reservation(
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) is
  'Server-only atomic registration reservation. The caller must use a cryptographically strong flow token, pass only its SHA-256 hexadecimal hash, and reuse the same token for retries with the same idempotency key.';

revoke execute on function public.room262_create_registration_reservation(
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
)
from public, anon, authenticated;

grant execute on function public.room262_create_registration_reservation(
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
)
to service_role;

commit;
