begin;
-- Report upstream failures as failed cron runs, rather than successful SQL calls.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.call_casa_fresca_forecast()'::regprocedure);
  if position('SELECT status, content::json INTO result' in definition) = 0 then
    raise exception 'Forecast scheduler response handler does not match expected structure';
  end if;
  definition := replace(definition, 'SELECT status, content::json INTO result', 'SELECT json_build_object(''status'', status, ''body'', content::json) INTO result');
  definition := replace(definition, 'RETURN result;', E'IF (result->>''status'')::integer <> 200 THEN\n    RAISE EXCEPTION ''Forecast refresh failed with HTTP %'', result->>''status'';\n  END IF;\n  RETURN result;');
  execute definition;
end $$;
commit;
