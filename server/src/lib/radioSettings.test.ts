import { describe, it, expect } from "vitest";
import { RADIO_SETTINGS_DEFAULTS } from "./radioSettings.js";

/**
 * The listener-count toggle is opt-out, not opt-in.
 *
 * Every existing station already shows "X জন শুনছেন"; shipping this with a
 * "false" default would silently strip that from every live show until an
 * admin noticed and went looking for a switch they had never been told
 * about. Admins turn it off deliberately or not at all.
 */
describe("RADIO_SETTINGS_DEFAULTS", () => {
  it("keeps the listener count visible unless an admin turns it off", () => {
    expect(RADIO_SETTINGS_DEFAULTS.radio_listener_count_visible).toBe("true");
  });

  it("expresses booleans as the exact string getRadioSettingBool compares against", () => {
    // getRadioSettingBool tests `=== "true"`, so "1"/"yes"/"TRUE" would all
    // read as false and silently disable a feature that looks enabled.
    const boolish = Object.entries(RADIO_SETTINGS_DEFAULTS).filter(([k]) =>
      k.endsWith("_enabled") || k.endsWith("_visible")
    );
    expect(boolish.length).toBeGreaterThan(0);
    for (const [key, value] of boolish) {
      expect(["true", "false"], `${key} = ${value}`).toContain(value);
    }
  });
});
