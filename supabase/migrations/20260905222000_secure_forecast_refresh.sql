begin;
-- Dedicated scheduler credential, kept in the private configuration table.
alter table public.casa_fresca_forecast_config add column refresh_token uuid not null default gen_random_uuid();
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.call_casa_fresca_forecast()'::regprocedure);
  if position('ARRAY[' in definition) = 0 then
    raise exception 'Forecast scheduler wrapper has no header array';
  end if;
  definition := replace(definition, 'ARRAY[', E'ARRAY[\n      (''x-forecast-token'', (SELECT refresh_token::text FROM public.casa_fresca_forecast_config WHERE id)),');
  execute definition;
end $$;
commit;
