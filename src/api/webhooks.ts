import express from "express";
import { verifyWebhook } from "@clerk/express/webhooks";
import { User } from "../infrastructure/entities/User";
import { Invoice } from "../infrastructure/entities/Invoice";
import { stripe } from "../infrastructure/stripe";
import Stripe from "stripe";

const webhooksRouter = express.Router();

webhooksRouter.post(
  "/clerk",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const evt = await verifyWebhook(req);

      const { id } = evt.data;
      const eventType = evt.type;
      console.log(
        `Received webhook with ID ${id} and event type of ${eventType}`
      );
      console.log("Webhook payload:", evt.data);

      if (eventType === "user.created") {
        const { id } = evt.data;
        const user = await User.findOne({ clerkUserId: id });
        if (user) {
          console.log("User already exists");
          return;
        }
        await User.create({
          firstName: evt.data.first_name,
          lastName: evt.data.last_name,
          email: evt.data.email_addresses[0].email_address,
          clerkUserId: id,
        });
      }

      if (eventType === "user.updated") {
        const { id } = evt.data;
        const user = await User.findOneAndUpdate({ clerkUserId: id }, {
          role: evt.data.public_metadata.role,
        });
      }

      if (eventType === "user.deleted") {
        const { id } = evt.data;
        await User.findOneAndDelete({ clerkUserId: id });
      }

      return res.send("Webhook received");
    } catch (err) {
      console.error("Error verifying webhook:", err);
      return res.status(400).send("Error verifying webhook");
    }
  }
);

webhooksRouter.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET as string;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (err: any) {
      console.error("Stripe webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const invoiceId = session.metadata?.invoiceId;
        if (invoiceId) {
          await Invoice.findByIdAndUpdate(invoiceId, { status: "PAID" });
          console.log(`[Stripe Webhook] Invoice ${invoiceId} marked PAID`);
        }
      }

      if (
        event.type === "checkout.session.expired" ||
        event.type === "payment_intent.payment_failed"
      ) {
        const session = event.data.object as any;
        const invoiceId = session.metadata?.invoiceId;
        if (invoiceId) {
          await Invoice.findByIdAndUpdate(invoiceId, { status: "FAILED" });
          console.log(`[Stripe Webhook] Invoice ${invoiceId} marked FAILED`);
        }
      }

      return res.json({ received: true });
    } catch (err) {
      console.error("Error handling Stripe webhook:", err);
      return res.status(500).send("Webhook handler error");
    }
  }
);

export default webhooksRouter;
