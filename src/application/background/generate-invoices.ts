import { addMonths } from "date-fns";
import { SolarUnit } from "../../infrastructure/entities/SolarUnit";
import { EnergyGenerationRecord } from "../../infrastructure/entities/EnergyGenerationRecord";
import { Invoice } from "../../infrastructure/entities/Invoice";

const DEFAULT_RATE_PER_KWH = 0.15;

export async function generateInvoicesForSolarUnit(solarUnit: any) {
  const installationDate: Date = solarUnit.get("installationDate");
  if (!installationDate) return;

  const latestRecord = await EnergyGenerationRecord.findOne({
    solarUnitId: solarUnit._id,
  }).sort({ timestamp: -1 });
  if (!latestRecord) return;

  const latestTimestamp: Date = latestRecord.get("timestamp");
  const ratePerKwh = process.env.STRIPE_RATE_PER_KWH
    ? parseFloat(process.env.STRIPE_RATE_PER_KWH)
    : DEFAULT_RATE_PER_KWH;

  let periodStart = new Date(installationDate);

  // Walk one-month billing periods anchored to the installation date,
  // creating a PENDING invoice for each fully-elapsed period (relative to
  // the latest data we actually have) that doesn't already have one.
  while (true) {
    const periodEnd = addMonths(periodStart, 1);
    if (periodEnd > latestTimestamp) break;

    const existing = await Invoice.findOne({
      solarUnitId: solarUnit._id,
      billingPeriodStart: periodStart,
      billingPeriodEnd: periodEnd,
    });

    if (!existing) {
      const usage = await EnergyGenerationRecord.aggregate([
        {
          $match: {
            solarUnitId: solarUnit._id,
            timestamp: { $gte: periodStart, $lt: periodEnd },
          },
        },
        { $group: { _id: null, totalWh: { $sum: "$energyGenerated" } } },
      ]);

      const totalWh = usage[0]?.totalWh || 0;
      const energyGeneratedKwh = Math.round((totalWh / 1000) * 100) / 100;

      if (energyGeneratedKwh > 0) {
        const amountDue = Math.round(energyGeneratedKwh * ratePerKwh * 100) / 100;
        await Invoice.create({
          solarUnitId: solarUnit._id,
          userId: solarUnit.get("userId"),
          billingPeriodStart: periodStart,
          billingPeriodEnd: periodEnd,
          energyGeneratedKwh,
          ratePerKwh,
          amountDue,
          status: "PENDING",
        });
      }
    }

    periodStart = periodEnd;
  }
}

export const generateInvoices = async () => {
  try {
    const solarUnits = await SolarUnit.find();
    for (const solarUnit of solarUnits) {
      await generateInvoicesForSolarUnit(solarUnit);
    }
    console.log(`[Invoice Generation] Ran for ${solarUnits.length} solar unit(s)`);
  } catch (error) {
    console.error("[Invoice Generation] Error:", error);
  }
};
