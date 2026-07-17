import mongoose from "mongoose";

export const ANOMALY_TYPES = [
  "OUTAGE",
  "SUDDEN_DROP",
  "GRADUAL_DEGRADATION",
  "SENSOR_ERROR",
  "DATA_GAP",
] as const;

export const ANOMALY_SEVERITIES = ["CRITICAL", "WARNING", "INFO"] as const;
export const ANOMALY_STATUSES = ["OPEN", "ACKNOWLEDGED", "RESOLVED"] as const;

const anomalySchema = new mongoose.Schema(
  {
    solarUnitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SolarUnit",
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ANOMALY_TYPES,
    },
    severity: {
      type: String,
      required: true,
      enum: ANOMALY_SEVERITIES,
    },
    detectedAt: {
      type: Date,
      default: Date.now,
    },
    periodStart: {
      type: Date,
      required: true,
    },
    periodEnd: {
      type: Date,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    metricValue: {
      type: Number,
      required: false,
    },
    expectedValue: {
      type: Number,
      required: false,
    },
    deviationPercent: {
      type: Number,
      required: false,
    },
    status: {
      type: String,
      required: true,
      enum: ANOMALY_STATUSES,
      default: "OPEN",
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    resolvedAt: {
      type: Date,
      required: false,
    },
  },
  { timestamps: true }
);

export const Anomaly = mongoose.model("Anomaly", anomalySchema);
