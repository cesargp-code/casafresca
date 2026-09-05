begin;
-- Reuse the existing project's scheduler credentials without copying secrets
-- into source control. Keep the monitor and its schedule unchanged.
do $$
declare
  definition text;
begin
  definition := pg_get_functiondef('public.call_casa_fresca_monitor()'::regprocedure);
  if position('/functions/v1/casa-fresca-monitor' in definition) = 0 then
    raise exception 'Existing monitor scheduler wrapper does not match expected structure';
  end if;
  definition := replace(definition, 'public.call_casa_fresca_monitor()', 'public.call_casa_fresca_forecast()');
  definition := replace(definition, '/functions/v1/casa-fresca-monitor', '/functions/v1/casa-fresca-forecast');
  definition := replace(definition, 'BEGIN', E'BEGIN\n  PERFORM extensions.http_set_curlopt(''CURLOPT_TIMEOUT_MS'', ''30000'');');
  execute definition;
end $$;
revoke all on function public.call_casa_fresca_forecast() from public, anon, authenticated;
grant execute on function public.call_casa_fresca_forecast() to service_role;
select cron.schedule('casa-fresca-forecast', '10 */6 * * *', 'SELECT public.call_casa_fresca_forecast();');
commit;
