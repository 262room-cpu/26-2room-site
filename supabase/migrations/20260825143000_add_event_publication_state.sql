begin;

alter table public.events
add column if not exists is_published boolean;

alter table public.events
add column if not exists published_at timestamptz;

update public.events
set is_published = true
where is_published is null;

update public.events
set published_at = coalesce(published_at, pg_catalog.now())
where is_published = true;

alter table public.events
alter column is_published set default false;

alter table public.events
alter column is_published set not null;

comment on column public.events.is_published is
  'Controls public event visibility independently from registration status.';

comment on column public.events.published_at is
  'Timestamp of the most recent event publication.';

commit;
