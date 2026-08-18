alter table public.events
  add column if not exists registration_form_type text;

update public.events
set registration_form_type =
  case
    when event_type = 'kids_run' then 'kids'
    else 'participant'
  end
where registration_form_type is null;

alter table public.events
  alter column registration_form_type set default 'participant',
  alter column registration_form_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_registration_form_type_check'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
      add constraint events_registration_form_type_check
      check (registration_form_type in ('kids', 'participant'));
  end if;
end
$$;