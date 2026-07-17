import express from "express";
import {
  getAllEnergyGenerationRecordsBySolarUnitId,
  getCapacityFactorBySolarUnitId,
} from "../application/energy-generation-record";
import { authenticationMiddleware } from "./middlewares/authentication-middleware";

const energyGenerationRecordRouter = express.Router();

energyGenerationRecordRouter
  .route("/solar-unit/:id")
  .get(authenticationMiddleware, getAllEnergyGenerationRecordsBySolarUnitId);

energyGenerationRecordRouter
  .route("/solar-unit/:id/capacity-factor")
  .get(authenticationMiddleware, getCapacityFactorBySolarUnitId);

export default energyGenerationRecordRouter;