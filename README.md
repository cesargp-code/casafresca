This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Reading retention

The Supabase `casa-fresca-monitor` Edge Function runs every 15 minutes and retains
30 days of readings for future local forecast calibration. The dashboard fetches
only the last seven days and continues to default to the 24-hour view.
Retention was extended from seven days on 2026-09-05; older history accumulates
gradually. The existing monitor source is gitignored and deployed separately from the app.

## Seven-day forecast

The right-hand **Previsión** option shows outdoor temperatures for the next 168
hours. The default remains **24 horas**, and **7 días atrás** displays observations.
The forecast uses the same chart, tooltip, spacing and update timestamp as the
historical view, with a dashed outdoor line. Predictions use local backyard adjustments for forecast lead ranges that pass
forward validation. The forecast view labels these as **Con ajuste local**.
The tomorrow overlay uses the same adjusted forecast response.

`casa_fresca_forecast_config` stores the station coordinates and a private scheduler
token. Configure its single row server-side; neither coordinates nor token are
exposed by the app. `casa_fresca_forecast_runs` holds immutable Open-Meteo Best
Match snapshots with their fetch time, location, model selection and hourly JSON.
The fetch time is when we retrieved the forecast, not the model initialization time.
Snapshots are retained for 38 days (30 days for evaluation plus forecast lead time).

The `casa-fresca-forecast` Edge Function fetches eight UTC calendar days to cover
seven days ahead even between refreshes. It validates all hourly temperatures
before inserting one complete snapshot, deduplicates six-hour UTC slots and keeps
the previous snapshot if fetching fails. The database cron job runs at 00:10,
06:10, 12:10 and 18:10 UTC. `/api/forecast` reads the latest stored snapshot;
opening the app does not call Open-Meteo. An open forecast view checks storage
every five minutes and on returning to the tab; the last successful snapshot is retained on refresh failures.

The forecast function source is tracked and deployed separately:

```bash
supabase functions deploy casa-fresca-forecast --use-api
supabase db push
```

The scheduler migration reuses the existing DavisStation monitor wrapper's gateway
authentication and adds a private forecast-only token. It requires that existing
wrapper and the `http` and `pg_cron` extensions. To fetch immediately after configuring
the location, call `select public.call_casa_fresca_forecast();` as the database owner.
Repeated calls in the same six-hour slot are skipped.

Forecast data is provided by Open-Meteo (CC BY 4.0). Its free endpoint is for
non-commercial use. See [API docs](https://open-meteo.com/en/docs) and
[terms and pricing](https://open-meteo.com/en/pricing).

## Local forecast calibration

`/api/forecast` fits adjustments from the last 30 days of backyard observations
and the stored forecast snapshots, cached for one hour or until a new snapshot
arrives. All history reads are paginated. Original stored forecasts stay immutable;
adjustments are applied only to the API response. Failed history reads fall back
to the original forecast. No database migration or worker deployment is needed.

Calibration excludes exact outdoor temperature plateaus lasting at least six hours
(with at least eight readings), including the start of each plateau. Invalid
readings and observation gaps over 30 minutes are also excluded from pairing.
This detects the current Wi-Fi outage without a permanent calendar-date exclusion.
It cannot detect every possible stale sensor value; future sensor timestamps would
provide stronger freshness checks. Raw observation charts are unchanged.

Each hourly observation is interpolated from adjacent valid readings and paired
with the newest forecast **issued before that hour** in each 24-hour lead bucket.
Each target hour counts once per bucket. Training uses completed Madrid calendar
days with at least 20 paired hours, up to the most recent 14 qualifying days.
Offsets are half the median observed-minus-forecast error in a circular three-hour
window, capped at ±4°C, with at least seven days of support at every hour.

The last seven qualifying days are checked with a rolling forward backtest. For
each test day, the model uses only complete observation days before the earliest
forecast issuance being evaluated, including for longer lead times. A lead bucket
is enabled only with at least five validation days, improvement on at least 60%
of those days, and a reduction in mean absolute error of both 0.1°C and 5%.
These are provisional checks on a short history, not a guarantee of future skill.
If valid station readings are more than seven days old, all adjustments switch off.
The API includes calibration status, excluded intervals, offsets and validation
metrics for inspection; unvalidated lead buckets keep the original temperatures.

Run the calibration audit with Node 22.18+ and the existing `.env.local` credentials:

```bash
npm run calibrate:forecast
npm run test:calibration
```

For a reproducible offline audit, provide a JSON file containing `readings` and
`runs`, an evaluation time, and optionally an output path:

```bash
npm run calibrate:forecast -- --input /tmp/history.json --now 2026-10-17T09:30:00Z --output /tmp/calibration.json
```

The initial audit is recorded in [the calibration report](docs/forecast-calibration-2026-10-17.md)
and its accompanying JSON. Subsequent API recalibrations use current data.

## Browser notifications

The app can ask mobile browsers for notification permission and, when VAPID is configured, create a Web Push subscription through `/api/push-subscriptions`. The Supabase monitor function sends push notifications when the open/close-window conditions are met.

Required environment variables:

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:you@example.com
```

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` is used by the browser to subscribe. `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` must also be configured in Supabase for the `casa-fresca-monitor` Edge Function so it can send push notifications. `VAPID_SUBJECT` is a contact URI for Web Push, not an email notification recipient.

Create a Supabase table for saved subscriptions:

```sql
create table casa_fresca_push_subscriptions (
  endpoint text primary key,
  subscription jsonb not null,
  user_agent text,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
```

On iPhone, browser push notifications require the site to be added to the home screen before the permission prompt is available.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
