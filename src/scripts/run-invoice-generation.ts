import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../infrastructure/db";
import { generateInvoices } from "../application/background/generate-invoices";

async function run() {
  await connectDB();
  await generateInvoices();
  await mongoose.disconnect();
  console.log("Invoice generation run complete.");
}

run();
