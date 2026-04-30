import { z } from "zod";

export const profileUpdateSchema = z
  .object({
    display_name: z.string().optional(),
    full_name: z.string().optional(),
    avatar_url: z.string().url().optional().or(z.literal("")),
    bio: z.string().optional(),
    preferred_language: z.string().optional(),
    genre: z.string().optional(),
    specialty: z.string().optional(),
    experience: z.string().optional(),
    phone: z.string().optional(),
    website_url: z.string().optional(),
    facebook_url: z.string().optional(),
    instagram_url: z.string().optional(),
    youtube_url: z.string().optional(),
    portfolio_url: z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });
