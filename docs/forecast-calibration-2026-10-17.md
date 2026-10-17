# Local forecast calibration — 17 October 2026

The initial audit used 2,879 readings from 17 September to 17 October and 137
stored forecast runs. The Wi-Fi plateau accounts for 275 excluded readings,
starting **14 October at 14:45 Europe/Madrid** and continuing through the latest
reading, **17 October at 11:15**. Both indoor and outdoor values were frozen;
the calibration filter checks the outdoor value, which stayed exactly 27.5°C.

The last valid reading was 14 October at 14:30 Madrid time. That partial day
was excluded from model fitting. The final offsets use the 14 qualifying days
from 30 September through 13 October. Forward validation covers 7–13 October
(168 distinct observation hours per lead bucket), with models refitted using
only observations available before the evaluated forecasts were issued.

| Hours after forecast fetch | Original MAE | Adjusted MAE | Days improved | Enabled |
| --- | ---: | ---: | ---: | --- |
| 0–24 | 1.27°C | 1.30°C | 5/7 | No |
| 24–48 | 1.32°C | 1.46°C | 3/7 | No |
| 48–72 | 1.42°C | 1.22°C | 5/7 | Yes |
| 72–96 | 1.73°C | 1.60°C | 4/7 | No |
| 96–120 | 2.00°C | 2.05°C | 3/7 | No |
| 120–144 | 2.37°C | 2.27°C | 5/7 | No |
| 144–168 | 2.67°C | 2.71°C | 3/7 | No |

MAE is mean absolute error. Only the 48–72-hour bucket passes all activation
checks, reducing validation MAE by about **14%**. Its current hourly offsets
range from **−0.61°C to +1.67°C**, with the largest positive correction around
13:00 Madrid time. The first two days, including tomorrow's overlay, retain
the original forecast until they demonstrate sufficient improvement.

This is an exploratory calibration on a short period of autumn weather.
The gate is an operational safeguard, not independent proof of future accuracy.
No new evaluation window was held aside after developing the method. Results
should be reassessed as fresh observations arrive. While the station is offline,
no frozen values enter the model; adjustments expire after seven days without
a valid reading.

Exact offsets, exclusion timestamps and metrics are in
[the audit JSON](forecast-calibration-2026-10-17.json). This is an audit artifact;
the running API computes its model from the current retained history.
