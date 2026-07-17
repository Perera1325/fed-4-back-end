import mongoose from "mongoose";
import { SolarUnit } from "./entities/SolarUnit";
import { User } from "./entities/User";
import dotenv from "dotenv";
import { connectDB } from "./db";

dotenv.config();

async function seed() {
  try {
    await connectDB();

    const clerkUserId = process.env.SEED_CLERK_USER_ID;
    if (!clerkUserId) {
      throw new Error(
        "SEED_CLERK_USER_ID is not set. Add it to your .env before running the seed script."
      );
    }

    await SolarUnit.deleteMany({});
    await User.deleteMany({ clerkUserId });

    const user = await User.create({
      firstName: process.env.SEED_USER_FIRST_NAME || "Vinod",
      lastName: process.env.SEED_USER_LAST_NAME || "Perera",
      email: process.env.SEED_USER_EMAIL || "bamunuge2002@gmail.com",
      clerkUserId,
      role: "admin",
    });

    const solarUnit = await SolarUnit.create({
      userId: user._id,
      serialNumber: "SU-0001",
      installationDate: new Date("2025-08-01"),
      capacity: 5000,
      status: "ACTIVE",
    });

    console.log(
      `Database seeded successfully. Created user ${user.email} (${user.role}) and linked solar unit: ${solarUnit.serialNumber}`
    );
  } catch (err) {
    console.error("Seeding error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

seed();