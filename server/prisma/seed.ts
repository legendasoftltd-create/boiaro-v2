import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import {
  asBoolean,
  asDate,
  asFloat,
  asInt,
  asNullableString,
  createCounters,
  dataCsvPath,
  parseStringArray,
  readCsvRows,
  type SeedCounters,
} from "./seeds/utils.js";

type SeedSummary = Record<string, SeedCounters>;

const DRY_RUN = process.argv.includes("--dry-run");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for seeding.");
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function seedSiteSettings(summary: SeedSummary) {
  const name = "site_settings";
  const counters = createCounters();
  const rows = await readCsvRows(dataCsvPath("site_settings_rows.csv"));
  let mediaUrlWarningCount = 0;

  for (const row of rows) {
    const key = row.setting_key?.trim();
    if (!key) {
      counters.skipped++;
      continue;
    }
    const value = row.setting_value ?? "";
    if (key.includes("logo") || key.includes("favicon") || key.includes("image")) {
      if (value.includes(".co/")) mediaUrlWarningCount++;
    }

    if (DRY_RUN) {
      counters.updated++;
      continue;
    }

    const existing = await prisma.siteSetting.findUnique({ where: { key } });
    if (existing) {
      await prisma.siteSetting.update({ where: { key }, data: { value } });
      counters.updated++;
    } else {
      await prisma.siteSetting.create({
        data: {
          id: row.id?.trim() || undefined,
          key,
          value,
        },
      });
      counters.inserted++;
    }
  }

  summary[name] = counters;
  if (mediaUrlWarningCount > 0) {
    console.warn(
      `[seed warning] site_settings has ${mediaUrlWarningCount} media URL values from a legacy host; verify for current environment.`
    );
  }
}

async function seedPlatformSettings(summary: SeedSummary) {
  const name = "platform_settings";
  const counters = createCounters();
  const rows = await readCsvRows(dataCsvPath("platform_settings_rows.csv"));

  for (const row of rows) {
    const key = row.key?.trim();
    if (!key) {
      counters.skipped++;
      continue;
    }

    if (DRY_RUN) {
      counters.updated++;
      continue;
    }

    const existing = await prisma.platformSetting.findUnique({ where: { key } });
    if (existing) {
      await prisma.platformSetting.update({ where: { key }, data: { value: row.value ?? "" } });
      counters.updated++;
    } else {
      await prisma.platformSetting.create({
        data: {
          key,
          value: row.value ?? "",
        },
      });
      counters.inserted++;
    }
  }

  summary[name] = counters;
}

async function seedHomepageSections(summary: SeedSummary) {
  const name = "homepage_sections";
  const counters = createCounters();
  const rows = await readCsvRows(dataCsvPath("homepage_sections_rows.csv"));

  for (const row of rows) {
    const sectionKey = row.section_key?.trim();
    if (!sectionKey) {
      counters.skipped++;
      continue;
    }

    const payload = {
      title: row.title?.trim() || sectionKey,
      subtitle: asNullableString(row.subtitle),
      is_enabled: asBoolean(row.is_enabled, true),
      sort_order: asInt(row.sort_order, 0),
      display_source: asNullableString(row.display_source),
    };

    if (DRY_RUN) {
      counters.updated++;
      continue;
    }

    const existing = await prisma.homepageSection.findUnique({ where: { section_key: sectionKey } });
    if (existing) {
      await prisma.homepageSection.update({ where: { section_key: sectionKey }, data: payload });
      counters.updated++;
    } else {
      await prisma.homepageSection.create({
        data: {
          id: row.id?.trim() || undefined,
          section_key: sectionKey,
          ...payload,
        },
      });
      counters.inserted++;
    }
  }

  summary[name] = counters;
}

async function seedAdPlacements(summary: SeedSummary) {
  const name = "ad_placements";
  const counters = createCounters();
  const rows = await readCsvRows(dataCsvPath("ad_placements_rows.csv"));

  for (const row of rows) {
    const placementKey = row.placement_key?.trim();
    if (!placementKey) {
      counters.skipped++;
      continue;
    }

    const payload = {
      label: row.label?.trim() || placementKey,
      is_enabled: asBoolean(row.is_enabled, true),
      ad_type: row.ad_type?.trim() || "banner",
      frequency: asNullableString(row.frequency),
      device_visibility: asNullableString(row.device_visibility),
      display_priority: row.display_priority?.trim() ? asInt(row.display_priority) : null,
      notes: asNullableString(row.notes),
    };

    if (DRY_RUN) {
      counters.updated++;
      continue;
    }

    const existing = await prisma.adPlacement.findUnique({ where: { placement_key: placementKey } });
    if (existing) {
      await prisma.adPlacement.update({ where: { placement_key: placementKey }, data: payload });
      counters.updated++;
    } else {
      await prisma.adPlacement.create({
        data: {
          id: row.id?.trim() || undefined,
          placement_key: placementKey,
          ...payload,
        },
      });
      counters.inserted++;
    }
  }

  summary[name] = counters;
}

async function seedEmailTemplates(summary: SeedSummary) {
  const name = "email_templates";
  const counters = createCounters();
  const rows = await readCsvRows(dataCsvPath("email_templates_rows.csv"));

  for (const row of rows) {
    const templateType = row.template_type?.trim();
    if (!templateType) {
      counters.skipped++;
      continue;
    }

    const payload = {
      name: row.name?.trim() || templateType,
      subject: row.subject?.trim() || "",
      body: row.body_html?.trim() || row.body_text?.trim() || "",
      variables: parseStringArray(row.variables),
      is_active: (row.status?.trim().toLowerCase() || "active") === "active",
    };

    if (DRY_RUN) {
      counters.updated++;
      continue;
    }

    const existing = await prisma.emailTemplate.findUnique({ where: { template_type: templateType } });
    if (existing) {
      await prisma.emailTemplate.update({ where: { template_type: templateType }, data: payload });
      counters.updated++;
    } else {
      await prisma.emailTemplate.create({
        data: {
          id: row.id?.trim() || undefined,
          template_type: templateType,
          ...payload,
        },
      });
      counters.inserted++;
    }
  }

  summary[name] = counters;
}

async function seedNotificationTemplates(summary: SeedSummary) {
  const name = "notification_templates";
  const counters = createCounters();
  const rows = await readCsvRows(dataCsvPath("notification_templates_rows.csv"));

  for (const row of rows) {
    const key = row.id?.trim();
    if (!key) {
      counters.skipped++;
      continue;
    }

    const payload = {
      name: row.name?.trim() || "Template",
      title: row.title?.trim() || "",
      message: row.message?.trim() || "",
      type: row.type?.trim() || "general",
      channel: row.channel?.trim() || "in_app",
      cta_text: asNullableString(row.cta_text),
      cta_link: asNullableString(row.cta_link),
      status: row.status?.trim() || "active",
    };

    if (DRY_RUN) {
      counters.updated++;
      continue;
    }

    const existing = await prisma.notificationTemplate.findUnique({ where: { id: key } });
    if (existing) {
      await prisma.notificationTemplate.update({ where: { id: key }, data: payload });
      counters.updated++;
    } else {
      await prisma.notificationTemplate.create({ data: { id: key, ...payload } });
      counters.inserted++;
    }
  }

  summary[name] = counters;
}

async function seedSubscriptionPlans(summary: SeedSummary) {
  const name = "subscription_plans";
  const counters = createCounters();
  const rows = await readCsvRows(dataCsvPath("subscription_plans_rows.csv"));

  for (const row of rows) {
    const id = row.id?.trim();
    const planName = row.name?.trim();
    if (!id || !planName) {
      counters.skipped++;
      continue;
    }

    const payload = {
      name: planName,
      description: asNullableString(row.description),
      price: asFloat(row.price, 0),
      duration_days: asInt(row.duration_days, 30),
      is_active: (row.status?.trim().toLowerCase() || "active") === "active",
      is_featured: asBoolean(row.is_featured, false),
      sort_order: asInt(row.sort_order, 0),
      features: parseStringArray(row.benefits),
    };

    if (DRY_RUN) {
      counters.updated++;
      continue;
    }

    const existing = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (existing) {
      await prisma.subscriptionPlan.update({ where: { id }, data: payload });
      counters.updated++;
    } else {
      await prisma.subscriptionPlan.create({ data: { id, ...payload } });
      counters.inserted++;
    }
  }

  summary[name] = counters;
}

async function seedCoinPackages(summary: SeedSummary) {
  const name = "coin_packages";
  const counters = createCounters();
  const rows = await readCsvRows(dataCsvPath("coin_packages_rows.csv"));

  for (const row of rows) {
    const id = row.id?.trim();
    const packageName = row.name?.trim();
    if (!id || !packageName) {
      counters.skipped++;
      continue;
    }

    const payload = {
      name: packageName,
      coins: asInt(row.coins, 0),
      price: asFloat(row.price, 0),
      bonus_coins: asInt(row.bonus_coins, 0),
      is_active: asBoolean(row.is_active, true),
      is_featured: asBoolean(row.is_featured, false),
      sort_order: asInt(row.sort_order, 0),
    };

    if (DRY_RUN) {
      counters.updated++;
      continue;
    }

    const existing = await prisma.coinPackage.findUnique({ where: { id } });
    if (existing) {
      await prisma.coinPackage.update({ where: { id }, data: payload });
      counters.updated++;
    } else {
      await prisma.coinPackage.create({ data: { id, ...payload } });
      counters.inserted++;
    }
  }

  summary[name] = counters;
}

async function seedBadgeDefinitions(summary: SeedSummary) {
  const name = "badge_definitions";
  const counters = createCounters();
  const rows = await readCsvRows(dataCsvPath("badge_definitions_rows.csv"));

  for (const row of rows) {
    const key = row.key?.trim();
    if (!key) {
      counters.skipped++;
      continue;
    }

    const payload = {
      title: row.title?.trim() || key,
      description: asNullableString(row.description),
      icon_url: asNullableString(row.icon_url),
      category: row.category?.trim() || "reading",
      condition_type: row.condition_type?.trim() || "count",
      condition_value: row.condition_value?.trim() ? asInt(row.condition_value) : null,
      coin_reward: row.coin_reward?.trim() ? asInt(row.coin_reward) : null,
      is_active: asBoolean(row.is_active, true),
      sort_order: row.sort_order?.trim() ? asInt(row.sort_order) : null,
    };

    if (DRY_RUN) {
      counters.updated++;
      continue;
    }

    const existing = await prisma.badgeDefinition.findUnique({ where: { key } });
    if (existing) {
      await prisma.badgeDefinition.update({ where: { key }, data: payload });
      counters.updated++;
    } else {
      await prisma.badgeDefinition.create({
        data: {
          id: row.id?.trim() || undefined,
          key,
          ...payload,
        },
      });
      counters.inserted++;
    }
  }

  summary[name] = counters;
}

async function seedNotificationPreferences(summary: SeedSummary) {
  const name = "notification_preferences";
  const counters = createCounters();
  const rows = await readCsvRows(dataCsvPath("notification_preferences_rows.csv"));
  let skippedMissingUsers = 0;

  for (const row of rows) {
    const userId = row.user_id?.trim();
    if (!userId) {
      counters.skipped++;
      continue;
    }

    if (DRY_RUN) {
      counters.updated++;
      continue;
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      counters.skipped++;
      skippedMissingUsers++;
      continue;
    }

    const payload = {
      push_enabled: asBoolean(row.push_enabled, true),
      email_enabled: asBoolean(row.email_enabled, true),
      promotional_enabled: asBoolean(row.promotional_enabled, true),
      reminder_enabled: asBoolean(row.reminder_enabled, true),
      order_enabled: asBoolean(row.order_enabled, true),
      support_enabled: asBoolean(row.support_enabled, true),
    };

    const existing = await prisma.notificationPreference.findUnique({ where: { user_id: userId } });
    if (existing) {
      await prisma.notificationPreference.update({ where: { user_id: userId }, data: payload });
      counters.updated++;
    } else {
      await prisma.notificationPreference.create({
        data: {
          id: row.id?.trim() || undefined,
          user_id: userId,
          ...payload,
          created_at: asDate(row.created_at) || undefined,
        },
      });
      counters.inserted++;
    }
  }

  summary[name] = counters;
  if (skippedMissingUsers > 0) {
    console.warn(
      `[seed warning] notification_preferences skipped ${skippedMissingUsers} rows because users were missing.`
    );
  }
}

function printSummary(summary: SeedSummary) {
  console.log("\nSeed summary:");
  for (const [name, stats] of Object.entries(summary)) {
    console.log(
      `- ${name}: inserted=${stats.inserted}, updated=${stats.updated}, skipped=${stats.skipped}`
    );
  }
}

async function main() {
  const summary: SeedSummary = {};
  console.log(`Starting default data seed${DRY_RUN ? " (dry-run)" : ""}...`);

  await seedSiteSettings(summary);
  await seedPlatformSettings(summary);
  await seedAdPlacements(summary);
  await seedHomepageSections(summary);
  await seedEmailTemplates(summary);
  await seedNotificationTemplates(summary);
  await seedSubscriptionPlans(summary);
  await seedCoinPackages(summary);
  await seedBadgeDefinitions(summary);
  await seedNotificationPreferences(summary);

  printSummary(summary);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
