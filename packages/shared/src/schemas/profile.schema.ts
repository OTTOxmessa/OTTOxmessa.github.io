import { z } from "zod";
import { localizedSchema } from "./common.schema";

export const profileSchema = z.object({
  name: localizedSchema,
  role: localizedSchema,
  intro: localizedSchema,
  lookingFor: localizedSchema.optional(),
  email: z.email(),
  links: z.array(z.object({ label: z.string().min(1), url: z.url() })).default([]),
  resumeUrl: z.string().optional(),
});

export type Profile = z.output<typeof profileSchema>;
