import mongoose from "mongoose";

const solarUnitSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  serialNumber: {
    type: String,
    required: true,
    // Not unique: every new sign-up gets auto-provisioned a demo solar
    // unit that shares the same underlying serial as the seeded demo
    // data-api dataset, so multiple accounts intentionally point at the
    // same physical serial while owning their own SolarUnit document
    // (and therefore their own independent anomalies/invoices).
  },
  installationDate: {
    type: Date,
    required: true,
  },
  capacity: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    required: true,
    enum: ["ACTIVE", "INACTIVE", "MAINTENANCE"],
  },
  latitude: {
    type: Number,
    required: false,
  },
  longitude: {
    type: Number,
    required: false,
  },
});

export const SolarUnit = mongoose.model("SolarUnit", solarUnitSchema);
