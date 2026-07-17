import { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { Anomaly } from "../infrastructure/entities/Anomaly";
import { SolarUnit } from "../infrastructure/entities/SolarUnit";
import { User } from "../infrastructure/entities/User";
import { NotFoundError, ValidationError } from "../domain/errors/errors";
import { GetAnomaliesQueryDto, UpdateAnomalyStatusDto } from "../domain/dtos/anomaly";

function buildFilter(query: any) {
  const results = GetAnomaliesQueryDto.safeParse(query);
  if (!results.success) {
    throw new ValidationError(results.error.message);
  }
  const filter: Record<string, string> = {};
  if (results.data.type) filter.type = results.data.type;
  if (results.data.severity) filter.severity = results.data.severity;
  if (results.data.status) filter.status = results.data.status;
  return filter;
}

export const getAnomaliesForUser = async (
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

    const solarUnits = await SolarUnit.find({ userId: user._id });
    const solarUnitIds = solarUnits.map((unit) => unit._id);

    const filter = buildFilter(req.query);
    const anomalies = await Anomaly.find({
      solarUnitId: { $in: solarUnitIds },
      ...filter,
    }).sort({ detectedAt: -1 });

    res.status(200).json(anomalies);
  } catch (error) {
    next(error);
  }
};

export const getAllAnomalies = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const filter = buildFilter(req.query);
    const anomalies = await Anomaly.find(filter)
      .populate("solarUnitId", "serialNumber")
      .sort({ detectedAt: -1 });

    res.status(200).json(anomalies);
  } catch (error) {
    next(error);
  }
};

export const updateAnomalyStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const results = UpdateAnomalyStatusDto.safeParse(req.body);
    if (!results.success) {
      throw new ValidationError(results.error.message);
    }

    const auth = getAuth(req);
    const user = await User.findOne({ clerkUserId: auth.userId });
    if (!user) {
      throw new NotFoundError("User not found");
    }

    const anomaly = await Anomaly.findById(id);
    if (!anomaly) {
      throw new NotFoundError("Anomaly not found");
    }

    if (user.get("role") !== "admin") {
      const ownsUnit = await SolarUnit.findOne({
        _id: anomaly.get("solarUnitId"),
        userId: user._id,
      });
      if (!ownsUnit) {
        throw new NotFoundError("Anomaly not found");
      }
    }

    anomaly.set("status", results.data.status);
    if (results.data.status === "RESOLVED") {
      anomaly.set("resolvedBy", user._id);
      anomaly.set("resolvedAt", new Date());
    }
    await anomaly.save();

    res.status(200).json(anomaly);
  } catch (error) {
    next(error);
  }
};
