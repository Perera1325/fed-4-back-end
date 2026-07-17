import { z } from "zod";

export const GetAnomaliesQueryDto = z.object({
  type: z
    .enum(["OUTAGE", "SUDDEN_DROP", "GRADUAL_DEGRADATION", "SENSOR_ERROR", "DATA_GAP"])
    .optional(),
  severity: z.enum(["CRITICAL", "WARNING", "INFO"]).optional(),
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).optional(),
});

export const UpdateAnomalyStatusDto = z.object({
  status: z.enum(["ACKNOWLEDGED", "RESOLVED"]),
});
