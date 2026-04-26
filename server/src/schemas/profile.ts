import { z } from "zod";

export const profileUpdateSchema = z
  .object({
    display_name: z.string().optional(),
    full_name: z.string().optional(),
    avatar_url: z.string().optional(),
    bio: z.string().optional(),
    preferred_language: z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });
