import { prisma } from "../lib/prisma.js";

export const getFooterData = async () => {
  const footerData = await prisma.siteSetting.findMany({});
  return {
    footerData,
  };
};