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

const DEMO_SOLAR_UNIT_SERIAL =
  process.env.DEMO_SOLAR_UNIT_SERIAL || "SU-0001";
const DEMO_SOLAR_UNIT_INSTALLATION_DATE = new Date("2025-08-01");
const DEMO_SOLAR_UNIT_CAPACITY_WATTS = process.env.CAPACITY_WATTS
  ? parseFloat(process.env.CAPACITY_WATTS)
  : 5000;

async function backfillSolarUnitIfNeeded(solarUnit: any) {
  const hasEnergyData = await EnergyGenerationRecord.exists({
    solarUnitId: solarUnit._id,
  });
  if (!hasEnergyData) {
    await syncEnergyGenerationRecordsForSolarUnit(solarUnit);
  }

  const hasAnomalies = await Anomaly.exists({ solarUnitId: solarUnit._id });
  if (!hasAnomalies) {
    await detectAnomaliesForSolarUnit(solarUnit);
  }

  const hasInvoices = await Invoice.exists({ solarUnitId: solarUnit._id });
  if (!hasInvoices) {
    await generateInvoicesForSolarUnit(solarUnit);
  }
}

export const authenticationMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const auth = getAuth(req);
    if (!auth.userId) {
      throw new UnauthorizedError("Unauthorized");
    }

    let user = await User.findOne({ clerkUserId: auth.userId });
    if (!user) {
      const clerkUser = await clerkClient.users.getUser(auth.userId);
      const primaryEmail =
        clerkUser.emailAddresses.find(
          (e) => e.id === clerkUser.primaryEmailAddressId
        )?.emailAddress || clerkUser.emailAddresses[0]?.emailAddress;

      const role =
        (clerkUser.publicMetadata as { role?: string })?.role === "admin"
          ? "admin"
          : "staff";

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
      console.log(
        `Auto-provisioned demo solar unit for new user ${user.get("email")}`
      );
    }

    backfillSolarUnitIfNeeded(solarUnit).catch((error) => {
      console.error(
        `Background backfill failed for ${user.get("email")} (will retry on next request):`,
        error
      );
    });

    next();
  } catch (error) {
    next(error);
  }
};
