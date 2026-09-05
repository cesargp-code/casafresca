begin;

create table public.casa_fresca_forecast_config (
  id boolean primary key default true check (id),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  location_label text not null,
  updated_at timestamptz not null default now()
);

-- Each immutable snapshot preserves what was predicted before observations arrive.
-- Hourly points are stored together so readers never see a partial forecast.
create table public.casa_fresca_forecast_runs (
  id bigint generated always as identity primary key,
  fetch_slot timestamptz not null unique,
  fetched_at timestamptz not null default now(),
  provider text not null default 'open-meteo',
  model text not null default 'best_match',
  latitude double precision not null,
  longitude double precision not null,
  location_label text not null,
  hourly jsonb not null check (jsonb_typeof(hourly) = 'array' and jsonb_array_length(hourly) >= 168)
);
create index casa_fresca_forecast_runs_fetched_at on public.casa_fresca_forecast_runs (fetched_at desc);
alter table public.casa_fresca_forecast_config enable row level security;
alter table public.casa_fresca_forecast_runs enable row level security;
revoke all on public.casa_fresca_forecast_config, public.casa_fresca_forecast_runs from anon, authenticated;
grant all on public.casa_fresca_forecast_config, public.casa_fresca_forecast_runs to service_role;
grant usage, select on sequence public.casa_fresca_forecast_runs_id_seq to service_role;
-- Public forecast data only; the station coordinates remain server-side.
grant select (id, fetched_at, provider, model, location_label, hourly) on public.casa_fresca_forecast_runs to anon, authenticated;
create policy "Read forecasts" on public.casa_fresca_forecast_runs for select to anon, authenticated using (true);

commit;
