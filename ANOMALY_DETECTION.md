# Anomaly Detection — Research & Design

This document covers the anomaly types the system detects, how each is identified programmatically, how severity is assigned, and what each anomaly means for the user. Detection runs against `EnergyGenerationRecord` data (energy generated in Wh, timestamp, interval hours) for each `SolarUnit`, using the unit's rated `capacity` (Watts) and `installationDate` for context.

## Anomaly Types

### 1. Total Outage
**What it is:** The unit produces near-zero energy during hours it should clearly be generating (daylight).
**Detection:** For each day, sum energy generated during daylight hours. Compare against the trailing 14-day daily average (excluding the day itself). Flag if the day's total is below 5% of that baseline (with an absolute floor so a genuinely low-output winter day near the seasonal baseline isn't misflagged).
**Severity:** Critical — a full day at ~0% output almost always means an inverter failure, tripped breaker, or total panel obstruction, and is a direct, ongoing revenue loss for every day it persists.
**User impact / action:** Check the inverter and breaker immediately, inspect panels for obstruction or damage, and contact a technician if the unit doesn't recover within a day.

### 2. Sudden Drop
**What it is:** A day's output is well below what's typical for that time of year, but not a total outage.
**Detection:** Same trailing 14-day baseline as above. Flag if the day's total is 40% or more below baseline, but above the outage threshold.
**Severity:** Warning — a real but partial loss, worth investigating but not an emergency.
**User impact / action:** Usually points to partial shading (new obstruction, seasonal shadow), soiling/dust buildup, or a partially failed string of panels. Worth a visual inspection and a cleaning if it persists across multiple days.

### 3. Gradual Degradation
**What it is:** A slow, sustained decline in output over weeks, distinct from a sudden drop or one-off bad day.
**Detection:** Compare the average daily output of the most recent 7 days against the average of the 7 days before that (i.e., days 8-14 back). Requires at least 21 days of history to run reliably (to avoid reacting to short-term weather noise). Flag if the recent window is down 15%+ (Warning) or 8-15% (Info).
**Severity:** Warning at 15%+ decline, Info between 8-15% — degradation is rarely urgent on its own, but the severity should reflect how fast it's happening.
**User impact / action:** Typically panel aging, accumulating dirt/debris, or connector corrosion. Not urgent, but worth scheduling a maintenance inspection and factoring into any long-term output planning.

### 4. Sensor Error / Impossible Reading
**What it is:** A single reading that is physically impossible given the unit's rated capacity — either negative, or higher than the panel could ever produce.
**Detection:** For each record, compute the maximum physically possible output for its interval: `capacity (W) × intervalHours × 1.15` (a 15% safety margin above nameplate rating to allow for brief real-world overproduction). Flag any record above that ceiling, or below zero.
**Severity:** Critical — not because generation is actually a problem, but because a bad reading corrupts billing calculations and any other metric derived from it (including the other four detectors) if left unflagged.
**User impact / action:** No action needed on the panels themselves; this points to a monitoring/sensor fault. Worth flagging to whoever manages the data pipeline so the bad reading isn't used for billing, and so the underlying sensor gets checked.

### 5. Data Gap
**What it is:** An expected reading never arrived — the monitoring stream went quiet for longer than its normal cadence, during hours generation was expected.
**Detection:** Look at the gap between consecutive records' timestamps. If a gap exceeds 3x the unit's normal interval (e.g., more than 6 hours when readings normally come every 2) and the missing window overlaps daylight hours, flag it for that missing period.
**Severity:** Warning — doesn't necessarily mean lost generation, but it does mean lost visibility, which silently breaks billing accuracy for that period if unnoticed.
**User impact / action:** Usually a connectivity issue between the monitoring device and the platform, not a generation problem. Check the unit's network connection; if generation-based billing covers this period, the gap should be flagged for manual review rather than billed as zero.

## Severity Levels

- **Critical** — confirmed, ongoing production or revenue loss, or a data-integrity issue that would corrupt billing. Needs prompt attention.
- **Warning** — a real, measurable deviation worth investigating soon, but not causing acute loss right now.
- **Info** — a minor or early-stage pattern, logged for visibility so it can be tracked over time, no immediate action expected.

## Data Used

All detectors operate only on data already collected by the platform: `energyGenerated` (Wh) and `timestamp` per `EnergyGenerationRecord`, `intervalHours`, and each `SolarUnit`'s `capacity` (Watts) and `installationDate`. No external data source is required.
