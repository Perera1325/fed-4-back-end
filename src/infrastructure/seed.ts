import mongoose from "mongoose";
import { SolarUnit } from "./entities/SolarUnit";
import { User } from "./entities/User";
import { EnergyGenerationRecord } from "./entities/EnergyGenerationRecord";
import dotenv from "dotenv";
import { connectDB } from "./db";

dotenv.config();

async function seed() {
  try {
    // Connect to DB
    await connectDB();

    const clerkUserId = process.env.SEED_CLERK_USER_ID;
    if (!clerkUserId) {
      throw new Error(
        "SEED_CLERK_USER_ID is not set. Add it to your .env (find it in the Clerk dashboard under Users) before running the seed script."
      );
    }

    // Clear existing data. Energy records are cleared too so that the next
    // sync pulls a completely fresh copy from the data-api instead of
    // trusting stale cached values (sync only fetches records newer than
    // the last one it already has, so if the data-api's historical data
    // ever gets regenerated with the same date range, this is required to
    // pick up the changes).
    await SolarUnit.deleteMany({});
    await User.deleteMany({ clerkUserId });
    await EnergyGenerationRecord.deleteMany({});

    // Create (or link) the signed-in user as an admin so /solar-units/me and
    // admin-only routes both work immediately after seeding.
    const user = await User.create({
      firstName: process.env.SEED_USER_FIRST_NAME || "Vinod",
      lastName: process.env.SEED_USER_LAST_NAME || "Perera",
      email: process.env.SEED_USER_EMAIL || "bamunuge2002@gmail.com",
      clerkUserId,
      role: "admin",
    });

    // Create a new solar unit, linked to that user
    const solarUnit = await SolarUnit.create({
      userId: user._id,
      serialNumber: "SU-0001",
      installationDate: new Date("2025-08-01"),
      capacity: process.env.CAPACITY_WATTS ? parseFloat(process.env.CAPACITY_WATTS) : 5000,
      status: "ACTIVE",
    });

    console.log(
      `Database seeded successfully. Created user ${user.email} (${user.role}), linked solar unit: ${solarUnit.serialNumber}, and cleared cached energy records (will re-sync fresh from data-api).`
    );
  } catch (err) {
    console.error("Seeding error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

seed();