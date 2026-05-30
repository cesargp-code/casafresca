create table if not exists public.casa_fresca_push_subscriptions (
  endpoint text primary key,
  subscription jsonb not null,
  user_agent text,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.casa_fresca_push_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'casa_fresca_push_subscriptions'
      and policyname = 'Service role can manage push subscriptions'
  ) then
    create policy "Service role can manage push subscriptions"
      on public.casa_fresca_push_subscriptions
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;
