import { GetAllEnergyGenerationRecordsQueryDto } from "../domain/dtos/solar-unit";
import { NotFoundError, ValidationError } from "../domain/errors/errors";
import { EnergyGenerationRecord } from "../infrastructure/entities/EnergyGenerationRecord";
import { SolarUnit } from "../infrastructure/entities/SolarUnit";
import { NextFunction, Request, Response } from "express";

export const getAllEnergyGenerationRecordsBySolarUnitId = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const results = GetAllEnergyGenerationRecordsQueryDto.safeParse(req.query);
    if (!results.success) {
      throw new ValidationError(results.error.message);
    }

    const { groupBy, limit } = results.data;

    if (!groupBy) {
      const energyGenerationRecords = await EnergyGenerationRecord.find({
        solarUnitId: id,
      }).sort({ timestamp: -1 });
      res.status(200).json(energyGenerationRecords);
    }

    if (groupBy === "date") {
      if (!limit) {
        const energyGenerationRecords = await EnergyGenerationRecord.aggregate([
          {
            $group: {
              _id: {
                date: {
                  $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
                },
              },
              totalEnergy: { $sum: "$energyGenerated" },
            },
          },
          {
            $sort: { "_id.date": -1 },
          },
        ]);

        res.status(200).json(energyGenerationRecords);
      }

      const energyGenerationRecords = await EnergyGenerationRecord.aggregate([
        {
          $group: {
            _id: {
              date: {
                $dateToString: { format: "%Y-%m-%d", date: "$timestamp" },
              },
            },
            totalEnergy: { $sum: "$energyGenerated" },
          },
        },
        {
          $sort: { "_id.date": -1 },
        },
      ]);

      res.status(200).json(energyGenerationRecords.slice(0, parseInt(limit)));
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Capacity Factor = (Actual Energy Generated / Theoretical Maximum) x 100%
 *
 * Theoretical maximum for a day = rated capacity (assumed Watts) converted
 * to kW, times 24 hours. Actual energy is assumed to be recorded in Wh and
 * is converted to kWh for the comparison. This is a simplified, illustrative
 * calculation intended for the dashboard chart, not a certified engineering
 * metric.
 */
export const getCapacityFactorBySolarUnitId = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const days = req.query.days ? parseInt(req.query.days as string) : 7;

    const solarUnit = await SolarUnit.findById(id);
    if (!solarUnit) {
      throw new NotFoundError("Solar unit not found");
    }
    const capacityWatts = solarUnit.get("capacity") as number;

    const dailyTotals = await EnergyGenerationRecord.aggregate([
      { $match: { solarUnitId: solarUnit._id } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
          },
          totalEnergyWh: { $sum: "$energyGenerated" },
        },
      },
      { $sort: { "_id.date": -1 } },
      { $limit: days },
    ]);

    const theoreticalMaxKwhPerDay = (capacityWatts / 1000) * 24;

    const capacityFactorByDay = dailyTotals
      .map((day) => {
        const actualKwh = day.totalEnergyWh / 1000;
        const capacityFactorPercent =
          theoreticalMaxKwhPerDay > 0
            ? Math.round((actualKwh / theoreticalMaxKwhPerDay) * 1000) / 10
            : 0;
        return {
          date: day._id.date,
          actualKwh: Math.round(actualKwh * 100) / 100,
          theoreticalMaxKwh: Math.round(theoreticalMaxKwhPerDay * 100) / 100,
          capacityFactorPercent,
        };
      })
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    res.status(200).json(capacityFactorByDay);
  } catch (error) {
    next(error);
  }
};