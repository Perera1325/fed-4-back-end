import express from "express";
import {
  getInvoicesForUser,
  getAllInvoices,
  createCheckoutSession,
  getCheckoutSessionStatus,
} from "../application/invoice";
import { authenticationMiddleware } from "./middlewares/authentication-middleware";
import { authorizationMiddleware } from "./middlewares/authorization-middleware";

const invoiceRouter = express.Router();

invoiceRouter.route("/me").get(authenticationMiddleware, getInvoicesForUser);
invoiceRouter
  .route("/")
  .get(authenticationMiddleware, authorizationMiddleware, getAllInvoices);
invoiceRouter
  .route("/checkout-session-status")
  .get(authenticationMiddleware, getCheckoutSessionStatus);
invoiceRouter
  .route("/:id/checkout-session")
  .post(authenticationMiddleware, createCheckoutSession);

export default invoiceRouter;
