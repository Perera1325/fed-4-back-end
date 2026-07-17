import express from "express";
import {
  getAnomaliesForUser,
  getAllAnomalies,
  updateAnomalyStatus,
} from "../application/anomaly";
import { authenticationMiddleware } from "./middlewares/authentication-middleware";
import { authorizationMiddleware } from "./middlewares/authorization-middleware";

const anomalyRouter = express.Router();

anomalyRouter.route("/me").get(authenticationMiddleware, getAnomaliesForUser);
anomalyRouter
  .route("/")
  .get(authenticationMiddleware, authorizationMiddleware, getAllAnomalies);
anomalyRouter.route("/:id").patch(authenticationMiddleware, updateAnomalyStatus);

export default anomalyRouter;
