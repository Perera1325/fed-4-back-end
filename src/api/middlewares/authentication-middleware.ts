import { clerkClient, getAuth } from "@clerk/express";
import { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../../domain/errors/errors";
import { User } from "../../infrastructure/entities/User";
import { SolarUnit } from "../../infrastructure/entities/SolarUnit";
import { EnergyGenerationRecord } from "../../infrastructure/entities/EnergyGenerationRecord";
import { Anomaly } from "../../infrastructure/entities/Anomaly";
import { Invoice } from "../../infrastructure/entities/Invoice";
import { syncEnergyGenerationRecordsForSolarUnit } from "./sync/sync-middleware";
import { detectAnomaliesForSolarUnit } from "../../application/background/detect-anomalies";
import { generateInvoicesForSolarUnit } from "../../application/background/generate-invoices";

const DEMO_SOLAR_UNIT_SERIAL = process.env.DEMO_SOLAR_UNIT_SERIAL || "SU-0001";
const DEMO_SOLAR_UNIT_INSTALLATION_DATE = new Date("2025-08-01");
const DEMO_SOLAR_UNIT_CAPACITY_WATTS = process.env.CAPACITY_WATTS
  ? parseFloat(process.env.CAPACITY_WATTS)
  : 5000;

const backfillInProgress = new Set<string>();

// Copies energy records from any other solar unit that already has data
// (sharing the same demo serial) straight from Mongo to Mongo. No network
// call to data-api, so it can't be slow, cold, or rate-limited.
async function cloneEnergyDataFromExistingUnit(solarUnit: any): Promise<boolean> {
  const templateUnit = await SolarUnit.findOne({
    serialNumber: solarUnit.serialNumber,
    _id: { $ne: solarUnit._id },
  });
  if (!templateUnit) return false;

  const templateRecords = await EnergyGenerationRecord.find({ solarUnitId: templateUnit._id }).lean();
  if (templateRecords.length === 0) return false;

  const clones = templateRecords.map((r: any) => {
    const { _id, __v, ...rest } = r;
    return { ...rest, solarUnitId: solarUnit._id };
  });
  await EnergyGenerationRecord.insertMany(clones);
  return true;
}

async function backfillSolarUnitIfNeeded(solarUnit: any) {
  const key = solarUnit._id.toString();
  if (backfillInProgress.has(key)) return;
  backfillInProgress.add(key);
  try {
    const hasEnergyData = await EnergyGenerationRecord.exists({ solarUnitId: solarUnit._id });
    if (!hasEnergyData) {
      const cloned = await cloneEnergyDataFromExistingUnit(solarUnit);
      if (!cloned) {
        // No existing unit to clone from yet (very first unit ever) — fall
        // back to the real sync against data-api.
        await syncEnergyGenerationRecordsForSolarUnit(solarUnit);
      }
    }

    const hasAnomalies = await Anomaly.exists({ solarUnitId: solarUnit._id });
    if (!hasAnomalies) await detectAnomaliesForSolarUnit(solarUnit);

    const hasInvoices = await Invoice.exists({ solarUnitId: solarUnit._id });
    if (!hasInvoices) await generateInvoicesForSolarUnit(solarUnit);
  } finally {
    backfillInProgress.delete(key);
  }
}

export const authenticationMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = getAuth(req);
    if (!auth.userId) throw new UnauthorizedError("Unauthorized");

    let user = await User.findOne({ clerkUserId: auth.userId });
    if (!user) {
      const clerkUser = await clerkClient.users.getUser(auth.userId);
      const primaryEmail =
        clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ||
        clerkUser.emailAddresses[0]?.emailAddress;
      const role = (clerkUser.publicMetadata as { role?: string })?.role === "admin" ? "admin" : "staff";
      user = await User.create({
        firstName: clerkUser.firstName || "",
        lastName: clerkUser.lastName || "",
        email: primaryEmail,
        clerkUserId: auth.userId,
        role,
      });
    }

    let solarUnit = await SolarUnit.findOne({ userId: user._id });
    if (!solarUnit) {
      solarUnit = await SolarUnit.create({
        userId: user._id,
        serialNumber: DEMO_SOLAR_UNIT_SERIAL,
        installationDate: DEMO_SOLAR_UNIT_INSTALLATION_DATE,
        capacity: DEMO_SOLAR_UNIT_CAPACITY_WATTS,
        status: "ACTIVE",
      });
      console.log(`Auto-provisioned demo solar unit for new user ${user.get("email")}`);
    }

    backfillSolarUnitIfNeeded(solarUnit).catch((error) => {
      console.error(`Background backfill failed for ${user.get("email")} (will retry on next request):`, error);
    });

    next();
  } catch (error) {
    next(error);
  }
};
