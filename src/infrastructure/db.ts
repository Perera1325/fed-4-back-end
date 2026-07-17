import mongoose from "mongoose";
import { SolarUnit } from "./entities/SolarUnit";

export const connectDB = async () => {
  try {
    console.log("Connecting to MongoDB");
    const MONGODB_URL = process.env.MONGODB_URL;
    if (!MONGODB_URL) {
      throw new Error("MONGODB_URL is not defined");
    }
    await mongoose.connect(MONGODB_URL);
    console.log("Connected to MongoDB");

    // Drop the now-unused unique index on SolarUnit.serialNumber (Mongoose
    // doesn't retroactively remove indexes that are no longer declared).
    await SolarUnit.syncIndexes();
  } catch (error) {
    console.log("Error while connecting to MongoDB", error);
  }
};
