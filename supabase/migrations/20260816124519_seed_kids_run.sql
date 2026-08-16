begin;

insert into public.events (
  slug,
  registration_code_prefix,
  title,
  subtitle,
  event_type,
  status,
  short_description,
  description,
  city,
  venue,
  address,
  timezone,
  starts_at,
  tentative_date,
  date_status,
  event_window_start,
  event_window_end,
  registration_opens_at,
  registration_closes_at,
  payment_merchant_account_id,
  capacity,
  price_minor,
  currency,
  cover_image_path,
  participant_note,
  distance_selection_note
)
values (
  'kids-run-karaganda-2026',
  null,
  '26.2 ROOM Kids Run',
  'Детский забег 26.2 ROOM',
  'kids_run',
  'coming_soon',
  'Детский беговой старт 26.2 ROOM в Центральном парке Караганды. Две дистанции на выбор — 500 м и 1000 м.',
  '26.2 ROOM готовит детский беговой старт в Центральном парке Караганды. Участники младше 15 лет смогут выбрать одну из двух дистанций — 500 или 1000 метров. Планируется 500 участников. Точная дата мероприятия сейчас согласовывается.',
  'Караганда',
  'Центральный парк',
  null,
  'Asia/Almaty',
  null,
  date '2026-09-14',
  'tentative',
  time '08:00',
  time '12:00',
  null,
  null,
  null,
  500,
  900000,
  'KZT',
  null,
  'Для детей до 15 лет.',
  'Дистанцию участник выбирает самостоятельно независимо от возраста.'
);

insert into public.event_distances (
  event_id,
  code,
  title,
  distance_meters,
  min_age,
  max_age,
  capacity,
  price_minor,
  sort_order
)
values
  (
    (select id from public.events where slug = 'kids-run-karaganda-2026'),
    '500m',
    '500 м',
    500,
    null,
    14,
    null,
    null,
    1
  ),
  (
    (select id from public.events where slug = 'kids-run-karaganda-2026'),
    '1000m',
    '1000 м',
    1000,
    null,
    14,
    null,
    null,
    2
  );

insert into public.event_kit_items (
  event_id,
  code,
  name,
  description,
  image_path,
  sort_order
)
values
  (
    (select id from public.events where slug = 'kids-run-karaganda-2026'),
    'control-wristband',
    'Контрольный браслет',
    null,
    null,
    1
  ),
  (
    (select id from public.events where slug = 'kids-run-karaganda-2026'),
    'silicone-wristband',
    'Силиконовый браслет 26.2 ROOM',
    null,
    null,
    2
  ),
  (
    (select id from public.events where slug = 'kids-run-karaganda-2026'),
    'cap',
    'Бейсболка 26.2 ROOM',
    null,
    null,
    3
  ),
  (
    (select id from public.events where slug = 'kids-run-karaganda-2026'),
    'medal',
    'Медаль 26.2 ROOM',
    null,
    null,
    4
  ),
  (
    (select id from public.events where slug = 'kids-run-karaganda-2026'),
    'collectible-figure',
    'Коллекционная фигурка 26.2 ROOM',
    null,
    null,
    5
  ),
  (
    (select id from public.events where slug = 'kids-run-karaganda-2026'),
    'stationery-accessories',
    'Набор аксессуаров для ручек / карандашей',
    null,
    null,
    6
  ),
  (
    (select id from public.events where slug = 'kids-run-karaganda-2026'),
    'keychain',
    'Брелок 26.2 ROOM',
    null,
    null,
    7
  ),
  (
    (select id from public.events where slug = 'kids-run-karaganda-2026'),
    'lanyard',
    'Лента 26.2 ROOM',
    null,
    null,
    8
  ),
  (
    (select id from public.events where slug = 'kids-run-karaganda-2026'),
    'branded-bag',
    'Фирменный пакет 26.2 ROOM',
    null,
    null,
    9
  ),
  (
    (select id from public.events where slug = 'kids-run-karaganda-2026'),
    'stickers',
    'Набор наклеек 26.2 ROOM',
    null,
    null,
    10
  );

insert into public.event_registration_counters (
  event_id,
  last_public_number
)
values (
  (select id from public.events where slug = 'kids-run-karaganda-2026'),
  0
);

commit;
