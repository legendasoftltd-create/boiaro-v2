import { z } from "zod";

export const bookListSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
  categoryId: z.string().optional(),
  search: z.string().optional(),
  isFeatured: z.coerce.boolean().optional(),
  isBestseller: z.coerce.boolean().optional(),
  isFree: z.coerce.boolean().optional(),
  language: z.string().optional(),
  authorId: z.string().optional(),
  publisherId: z.string().optional(),
});

export const bookByIdSchema = z.object({
  id: z.string(),
});

export const bookBySlugSchema = z.object({
  slug: z.string().min(1),
});

export const bookReviewsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
});

export const postReviewSchema = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
});
