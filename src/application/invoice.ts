import { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { Invoice } from "../infrastructure/entities/Invoice";
import { User } from "../infrastructure/entities/User";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../domain/errors/errors";
import { GetInvoicesQueryDto } from "../domain/dtos/invoice";
import { stripe } from "../infrastructure/stripe";

function buildFilter(query: any) {
  const results = GetInvoicesQueryDto.safeParse(query);
  if (!results.success) {
    throw new ValidationError(results.error.message);
  }
  const filter: Record<string, string> = {};
  if (results.data.status) filter.status = results.data.status;
  return filter;
}

export const getInvoicesForUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const auth = getAuth(req);
    const user = await User.findOne({ clerkUserId: auth.userId });
    if (!user) {
      throw new NotFoundError("User not found");
    }

    const filter = buildFilter(req.query);
    const invoices = await Invoice.find({ userId: user._id, ...filter })
      .populate("solarUnitId", "serialNumber")
      .sort({ billingPeriodStart: -1 });

    res.status(200).json(invoices);
  } catch (error) {
    next(error);
  }
};

export const getAllInvoices = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const filter = buildFilter(req.query);
    const invoices = await Invoice.find(filter)
      .populate("solarUnitId", "serialNumber")
      .populate("userId", "firstName lastName email")
      .sort({ billingPeriodStart: -1 });

    res.status(200).json(invoices);
  } catch (error) {
    next(error);
  }
};

export const createCheckoutSession = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const auth = getAuth(req);
    const user = await User.findOne({ clerkUserId: auth.userId });
    if (!user) {
      throw new NotFoundError("User not found");
    }

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      throw new NotFoundError("Invoice not found");
    }

    const isOwner = invoice.get("userId").toString() === user._id.toString();
    if (user.get("role") !== "admin" && !isOwner) {
      throw new ForbiddenError("Forbidden");
    }

    if (invoice.get("status") === "PAID") {
      throw new ValidationError("Invoice is already paid");
    }

    const priceId = process.env.STRIPE_PRICE_PER_KWH;
    if (!priceId) {
      throw new Error("STRIPE_PRICE_PER_KWH is not configured");
    }

    const quantity = Math.max(
      1,
      Math.round(invoice.get("energyGeneratedKwh") as number)
    );

    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      mode: "payment",
      line_items: [{ price: priceId, quantity }],
      metadata: { invoiceId: (invoice._id as any).toString() },
      return_url: `${
        process.env.FRONTEND_URL || "http://localhost:5173"
      }/dashboard/invoices/confirmation?session_id={CHECKOUT_SESSION_ID}`,
    });

    invoice.set("stripeCheckoutSessionId", session.id);
    await invoice.save();

    res.status(200).json({ clientSecret: session.client_secret });
  } catch (error) {
    next(error);
  }
};

export const getCheckoutSessionStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const sessionId = req.query.session_id as string;
    if (!sessionId) {
      throw new ValidationError("session_id is required");
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    res.status(200).json({
      status: session.status,
      paymentStatus: session.payment_status,
    });
  } catch (error) {
    next(error);
  }
};
