import { z } from "zod";

export const skillSchema = z.object({
  group: z.string().min(1),
  name: z.string().min(1),
  order: z.number().int().default(100),
});

export const skillListSchema = z.array(skillSchema);

export type Skill = z.output<typeof skillSchema>;
