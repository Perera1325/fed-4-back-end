import { EnergyGenerationRecord } from "../../infrastructure/entities/EnergyGenerationRecord";
import { SolarUnit } from "../../infrastructure/entities/SolarUnit";
import { Anomaly } from "../../infrastructure/entities/Anomaly";

const LOOKBACK_DAYS = 30;
const DAYLIGHT_START_HOUR = 6;
const DAYLIGHT_END_HOUR = 18;

type DailyTotal = { date: string; totalWh: number };

function toDateKey(timestamp: Date): string {
  return timestamp.toISOString().slice(0, 10);
}

function isDaylightHour(timestamp: Date): boolean {
  const hour = timestamp.getUTCHours();
  return hour >= DAYLIGHT_START_HOUR && hour <= DAYLIGHT_END_HOUR;
}

function aggregateByDay(records: { timestamp: Date; energyGenerated: number }[]): DailyTotal[] {
  const totals = new Map<string, number>();
  for (const record of records) {
    const key = toDateKey(record.timestamp);
    totals.set(key, (totals.get(key) || 0) + record.energyGenerated);
  }
  return Array.from(totals.entries())
    .map(([date, totalWh]) => ({ date, totalWh }))
    .sort((a, b) => (a.date > b.date ? 1 : -1));
}

async function createAnomalyIfNew(anomaly: {
  solarUnitId: any;
  type: string;
  severity: string;
  periodStart: Date;
  periodEnd: Date;
  description: string;
  metricValue?: number;
  expectedValue?: number;
  deviationPercent?: number;
}) {
  const existing = await Anomaly.findOne({
    solarUnitId: anomaly.solarUnitId,
    type: anomaly.type,
    periodStart: anomaly.periodStart,
  });
  if (existing) return;

  await Anomaly.create(anomaly);
}

async function detectOutages(solarUnitId: any, dailyTotals: DailyTotal[]) {
  for (let i = 0; i < dailyTotals.length; i++) {
    const priorDays = dailyTotals.slice(Math.max(0, i - 14), i);
    if (priorDays.length < 5) continue;

    const baseline =
      priorDays.reduce((sum, d) => sum + d.totalWh, 0) / priorDays.length;
    if (baseline <= 0) continue;

    const day = dailyTotals[i];
    const threshold = Math.max(baseline * 0.05, 200);

    if (day.totalWh < threshold) {
      const deviationPercent = Math.round(((baseline - day.totalWh) / baseline) * 100);
      await createAnomalyIfNew({
        solarUnitId,
        type: "OUTAGE",
        severity: "CRITICAL",
        periodStart: new Date(`${day.date}T00:00:00.000Z`),
        periodEnd: new Date(`${day.date}T23:59:59.999Z`),
        description: `Near-zero output on ${day.date}: ${day.totalWh}Wh vs a ${Math.round(
          baseline
        )}Wh trailing average — likely equipment failure or total obstruction.`,
        metricValue: day.totalWh,
        expectedValue: Math.round(baseline),
        deviationPercent,
      });
    }
  }
}

async function detectSuddenDrops(solarUnitId: any, dailyTotals: DailyTotal[]) {
  for (let i = 0; i < dailyTotals.length; i++) {
    const priorDays = dailyTotals.slice(Math.max(0, i - 14), i);
    if (priorDays.length < 5) continue;

    const baseline =
      priorDays.reduce((sum, d) => sum + d.totalWh, 0) / priorDays.length;
    if (baseline <= 0) continue;

    const day = dailyTotals[i];
    const deviationPercent = ((baseline - day.totalWh) / baseline) * 100;
    const outageThreshold = Math.max(baseline * 0.05, 200);

    if (deviationPercent >= 40 && day.totalWh >= outageThreshold) {
      await createAnomalyIfNew({
        solarUnitId,
        type: "SUDDEN_DROP",
        severity: "WARNING",
        periodStart: new Date(`${day.date}T00:00:00.000Z`),
        periodEnd: new Date(`${day.date}T23:59:59.999Z`),
        description: `Output on ${day.date} was ${Math.round(
          deviationPercent
        )}% below the trailing 14-day average (${day.totalWh}Wh vs ~${Math.round(
          baseline
        )}Wh) — check for shading or soiling.`,
        metricValue: day.totalWh,
        expectedValue: Math.round(baseline),
        deviationPercent: Math.round(deviationPercent),
      });
    }
  }
}

async function detectGradualDegradation(solarUnitId: any, dailyTotals: DailyTotal[]) {
  if (dailyTotals.length < 21) return;

  const last7 = dailyTotals.slice(-7);
  const prior7 = dailyTotals.slice(-14, -7);
  if (last7.length < 7 || prior7.length < 7) return;

  const recentAvg = last7.reduce((sum, d) => sum + d.totalWh, 0) / last7.length;
  const priorAvg = prior7.reduce((sum, d) => sum + d.totalWh, 0) / prior7.length;
  if (priorAvg <= 0) return;

  const declinePercent = ((priorAvg - recentAvg) / priorAvg) * 100;
  if (declinePercent < 8) return;

  const severity = declinePercent >= 15 ? "WARNING" : "INFO";
  const periodStart = new Date(`${last7[0].date}T00:00:00.000Z`);
  const periodEnd = new Date(`${last7[last7.length - 1].date}T23:59:59.999Z`);

  await createAnomalyIfNew({
    solarUnitId,
    type: "GRADUAL_DEGRADATION",
    severity,
    periodStart,
    periodEnd,
    description: `Output has declined ${Math.round(
      declinePercent
    )}% over the last 7 days compared to the previous 7 (~${Math.round(
      recentAvg
    )}Wh/day vs ~${Math.round(priorAvg)}Wh/day) — may indicate aging or soiling buildup.`,
    metricValue: Math.round(recentAvg),
    expectedValue: Math.round(priorAvg),
    deviationPercent: Math.round(declinePercent),
  });
}

async function detectSensorErrors(
  solarUnitId: any,
  capacityWatts: number,
  records: { timestamp: Date; energyGenerated: number; intervalHours: number }[]
) {
  for (const record of records) {
    const physicalMaxWh = capacityWatts * record.intervalHours * 1.15;
    const isImpossible = record.energyGenerated < 0 || record.energyGenerated > physicalMaxWh;
    if (!isImpossible) continue;

    await createAnomalyIfNew({
      solarUnitId,
      type: "SENSOR_ERROR",
      severity: "CRITICAL",
      periodStart: record.timestamp,
      periodEnd: record.timestamp,
      description:
        record.energyGenerated < 0
          ? `Negative reading (${record.energyGenerated}Wh) at ${record.timestamp.toISOString()} — physically impossible, likely a sensor fault.`
          : `Reading of ${record.energyGenerated}Wh at ${record.timestamp.toISOString()} exceeds the unit's physical maximum (~${Math.round(
              physicalMaxWh
            )}Wh for this interval) — likely a sensor fault, not real generation.`,
      metricValue: record.energyGenerated,
      expectedValue: Math.round(physicalMaxWh),
    });
  }
}

async function detectDataGaps(
  solarUnitId: any,
  records: { timestamp: Date; intervalHours: number }[]
) {
  if (records.length < 2) return;

  const typicalIntervalHours = records[0].intervalHours || 2;
  const gapThresholdMs = typicalIntervalHours * 3 * 60 * 60 * 1000;

  for (let i = 1; i < records.length; i++) {
    const previous = records[i - 1];
    const current = records[i];
    const gapMs = current.timestamp.getTime() - previous.timestamp.getTime();

    if (gapMs <= gapThresholdMs) continue;
    if (!isDaylightHour(previous.timestamp) && !isDaylightHour(current.timestamp)) continue;

    const gapHours = Math.round(gapMs / (60 * 60 * 1000));
    await createAnomalyIfNew({
      solarUnitId,
      type: "DATA_GAP",
      severity: "WARNING",
      periodStart: previous.timestamp,
      periodEnd: current.timestamp,
      description: `No readings received for ~${gapHours} hours between ${previous.timestamp.toISOString()} and ${current.timestamp.toISOString()} — likely a connectivity issue, not a real generation gap.`,
      metricValue: gapHours,
      expectedValue: typicalIntervalHours,
    });
  }
}

async function detectAnomaliesForSolarUnit(solarUnit: any) {
  const latestRecord = await EnergyGenerationRecord.findOne({
    solarUnitId: solarUnit._id,
  }).sort({ timestamp: -1 });
  if (!latestRecord) return;

  const since = new Date(
    latestRecord.get("timestamp").getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );
  const records = await EnergyGenerationRecord.find({
    solarUnitId: solarUnit._id,
    timestamp: { $gte: since },
  }).sort({ timestamp: 1 });

  if (records.length === 0) return;

  const capacityWatts = solarUnit.get("capacity") as number;
  const dailyTotals = aggregateByDay(records);

  await detectSensorErrors(solarUnit._id, capacityWatts, records as any);
  await detectDataGaps(solarUnit._id, records as any);
  await detectOutages(solarUnit._id, dailyTotals);
  await detectSuddenDrops(solarUnit._id, dailyTotals);
  await detectGradualDegradation(solarUnit._id, dailyTotals);
}

export const detectAnomalies = async () => {
  try {
    const solarUnits = await SolarUnit.find();
    for (const solarUnit of solarUnits) {
      await detectAnomaliesForSolarUnit(solarUnit);
    }
    console.log(`[Anomaly Detection] Ran for ${solarUnits.length} solar unit(s)`);
  } catch (error) {
    console.error("[Anomaly Detection] Error:", error);
  }
};
