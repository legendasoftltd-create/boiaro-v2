// services/categories.service.ts

import { prisma } from "../lib/prisma.js";

export const getAllCategories = async () => {
  const categories = await prisma.category.findMany({
    where: {
      status: "active",
    },
    orderBy: [
      {
        priority: "asc",
      },
      {
        created_at: "desc",
      },
    ],
    select: {
      id: true,
      name: true,
      name_bn: true,
      name_en: true,
      icon: true,
      color: true,
      slug: true,
      is_featured: true,
      is_trending: true,
      priority: true,
    },
  });

  return {
    categories,
  };
};