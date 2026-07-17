import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../infrastructure/db";
import { detectAnomalies } from "../application/background/detect-anomalies";

async function run() {
  await connectDB();
  await detectAnomalies();
  await mongoose.disconnect();
  console.log("Anomaly detection run complete.");
}

run();
