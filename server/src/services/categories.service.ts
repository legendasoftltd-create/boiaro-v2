// services/categories.service.ts

import { prisma } from "../lib/prisma.js";
import { resolveFileUrl } from "../lib/mediaUrl.js";

function resolveCategory(c: any) {
  return {
    id: c.id,
    name: c.name,
    name_bn: c.name_bn ?? null,
    name_en: c.name_en ?? null,
    slug: c.slug ?? null,
    icon: resolveFileUrl(c.icon) ?? c.icon ?? null,
    color: c.color ?? null,
    is_featured: c.is_featured ?? false,
    is_trending: c.is_trending ?? false,
    priority: c.priority ?? 0,
    book_count: c._count?.books ?? 0,
  };
}

const CATEGORY_SELECT = {
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
  _count: { select: { books: { where: { submission_status: "approved" as const } } } },
};

export const getAllCategories = async () => {
  const categories = await prisma.category.findMany({
    where: { status: "active" },
    orderBy: [{ priority: "asc" }, { created_at: "desc" }],
    select: CATEGORY_SELECT,
  });

  return { categories: categories.map(resolveCategory) };
};

export const getCategoryById = async (id: string) => {
  const c = await prisma.category.findFirst({
    where: { OR: [{ id }, { slug: id }], status: "active" },
    select: CATEGORY_SELECT,
  });

  if (!c) return null;
  return resolveCategory(c);
};
