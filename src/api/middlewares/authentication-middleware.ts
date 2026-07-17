import { clerkClient, getAuth } from "@clerk/express";
import { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../../domain/errors/errors";
import { User } from "../../infrastructure/entities/User";
import { SolarUnit } from "../../infrastructure/entities/SolarUnit";
import { syncEnergyGenerationRecordsForSolarUnit } from "./sync/sync-middleware";
import { detectAnomaliesForSolarUnit } from "../../application/background/detect-anomalies";
import { generateInvoicesForSolarUnit } from "../../application/background/generate-invoices";

const DEMO_SOLAR_UNIT_SERIAL =
  process.env.DEMO_SOLAR_UNIT_SERIAL || "SU-0001";
const DEMO_SOLAR_UNIT_INSTALLATION_DATE = new Date("2025-08-01");
const DEMO_SOLAR_UNIT_CAPACITY_WATTS = process.env.CAPACITY_WATTS
  ? parseFloat(process.env.CAPACITY_WATTS)
  : 5000;

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

    const existingSolarUnit = await SolarUnit.findOne({ userId: user._id });
    if (!existingSolarUnit) {
      const solarUnit = await SolarUnit.create({
        userId: user._id,
        serialNumber: DEMO_SOLAR_UNIT_SERIAL,
        installationDate: DEMO_SOLAR_UNIT_INSTALLATION_DATE,
        capacity: DEMO_SOLAR_UNIT_CAPACITY_WATTS,
        status: "ACTIVE",
      });
      console.log(
        `Auto-provisioned demo solar unit for new user ${user.get("email")}`
      );

      try {
        await syncEnergyGenerationRecordsForSolarUnit(solarUnit);
        await detectAnomaliesForSolarUnit(solarUnit);
        await generateInvoicesForSolarUnit(solarUnit);
        console.log(
          `Backfilled energy data, anomalies and invoices for ${user.get("email")}`
        );
      } catch (backfillError) {
        console.error(
          `Backfill failed for new user ${user.get("email")} (will catch up via daily cron):`,
          backfillError
        );
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};
