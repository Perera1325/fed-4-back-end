import { z } from "zod";

export const GetInvoicesQueryDto = z.object({
  status: z.enum(["PENDING", "PAID", "FAILED"]).optional(),
});
