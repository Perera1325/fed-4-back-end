import mongoose from "mongoose";

export const INVOICE_STATUSES = ["PENDING", "PAID", "FAILED"] as const;

const invoiceSchema = new mongoose.Schema(
  {
    solarUnitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SolarUnit",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    billingPeriodStart: {
      type: Date,
      required: true,
    },
    billingPeriodEnd: {
      type: Date,
      required: true,
    },
    energyGeneratedKwh: {
      type: Number,
      required: true,
    },
    ratePerKwh: {
      type: Number,
      required: true,
    },
    amountDue: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: INVOICE_STATUSES,
      default: "PENDING",
    },
    stripeCheckoutSessionId: {
      type: String,
      required: false,
    },
  },
  { timestamps: true }
);

export const Invoice = mongoose.model("Invoice", invoiceSchema);
