import { z } from "zod";
import { LAYER_IDS } from "../constants/layers";
import { localizedSchema } from "./common.schema";

/** การ์ด "สิ่งที่ผมทำได้" ในหน้าแรก — จับคู่กลุ่มทักษะ (skills.json) กับ layer */
export const areaSchema = z.object({
  title: localizedSchema,
  description: localizedSchema,
  layers: z.array(z.enum(LAYER_IDS)).min(1),
  skillGroups: z.array(z.string().min(1)).min(1),
  points: z.array(localizedSchema).default([]),
  /** การ์ดที่เน้น (กรอบสี + ป้าย) — ควรมีแค่ใบเดียว */
  featured: z.boolean().default(false),
});

export const areaListSchema = z.array(areaSchema).min(1).max(4);

export type Area = z.output<typeof areaSchema>;
