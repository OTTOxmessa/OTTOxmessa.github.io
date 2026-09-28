import { z } from "zod";
import { LAYER_IDS } from "../constants/layers";

export const skillSchema = z.object({
  group: z.string().min(1),
  name: z.string().min(1),
  order: z.number().int().default(100),
  /** layer ที่ทักษะนี้ใช้ — แสดงใน Stack Explorer หน้าแรก */
  layer: z.enum(LAYER_IDS).optional(),
});

export const skillListSchema = z.array(skillSchema);

export type Skill = z.output<typeof skillSchema>;
