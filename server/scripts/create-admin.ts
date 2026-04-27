import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = "sadmin@gmail.com";
  const password = "password";
  const displayName = "Super Admin";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists — updating role to admin.`);
    await prisma.userRole.upsert({
      where: { user_id_role: { user_id: existing.id, role: "admin" } },
      create: { user_id: existing.id, role: "admin" },
      update: {},
    });
    console.log("Admin role ensured for existing user.");
    return;
  }

  const password_hash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      password_hash,
      profile: {
        create: {
          display_name: displayName,
          referral_code: "SADMIN001",
        },
      },
      roles: {
        create: { role: "admin" },
      },
    },
    include: { roles: true },
  });

  console.log("Super admin created:");
  console.log(`   ID    : ${user.id}`);
  console.log(`   Email : ${email}`);
  console.log(`   Pass  : ${password}`);
  console.log(`   Roles : ${user.roles.map(r => r.role).join(", ")}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
