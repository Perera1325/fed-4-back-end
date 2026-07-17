import { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { NotFoundError } from "../../../domain/errors/errors";
import { User } from "../../../infrastructure/entities/User"
import { SolarUnit } from "../../../infrastructure/entities/SolarUnit";
import { EnergyGenerationRecord } from "../../../infrastructure/entities/EnergyGenerationRecord";

import { z } from "zod";

export const DataAPIEnergyGenerationRecordDto = z.object({
    _id: z.string(),
    serialNumber: z.string(),
    energyGenerated: z.number(),
    timestamp: z.string(),
    intervalHours: z.number(),
    __v: z.number(),
});

const SYNC_TIMEOUT_MS = 8000;

export async function syncEnergyGenerationRecordsForSolarUnit(solarUnit: any) {
    const dataApiBaseUrl = process.env.DATA_API_URL || "http://localhost:8001";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

    const dataAPIResponse = await fetch(
        `${dataApiBaseUrl}/api/energy-generation-records/solar-unit/${solarUnit.serialNumber}`,
        { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!dataAPIResponse.ok) {
        throw new Error(
            `data-api responded with status ${dataAPIResponse.status}`
        );
    }

    const latestEnergyGenerationRecords = DataAPIEnergyGenerationRecordDto
        .array()
        .parse(await dataAPIResponse.json());

    const lastSyncedRecord = await EnergyGenerationRecord
        .findOne({ solarUnitId: solarUnit._id })
        .sort({ timestamp: -1 });

    const newRecords = latestEnergyGenerationRecords.filter(apiRecord => {
        if (!lastSyncedRecord) return true;
        return new Date(apiRecord.timestamp) > lastSyncedRecord.timestamp;
    });

    if (newRecords.length > 0) {
        const recordsToInsert = newRecords.map(record => ({
            solarUnitId: solarUnit._id,
            energyGenerated: record.energyGenerated,
            timestamp: new Date(record.timestamp),
            intervalHours: record.intervalHours,
        }));

        await EnergyGenerationRecord.insertMany(recordsToInsert);
        console.log(`Synced ${recordsToInsert.length} new energy generation records`);
    } else {
        console.log("No new records to sync");
    }
}

export const syncMiddleware = async (
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

        const solarUnit = await SolarUnit.findOne({ userId: user._id });
        if (!solarUnit) {
            throw new NotFoundError("Solar unit not found");
        }

        try {
            await syncEnergyGenerationRecordsForSolarUnit(solarUnit);
        } catch (syncError) {
            console.error(
                "Sync with data-api failed (continuing with existing data):",
                syncError
            );
        }

        next();
    } catch (error) {
        console.error("Sync middleware error:", error);
        next(error);
    }
};
