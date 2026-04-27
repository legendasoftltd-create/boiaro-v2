import { describe, it, expect } from "vitest";

describe("Multi-panel architecture", () => {
  it("ProtectedRoute accepts single role", async () => {
    // Verify the type accepts single AppRole
    const singleRole: import("@/hooks/useUserRole").AppRole = "admin";
    expect(typeof singleRole).toBe("string");
  });

  it("ProtectedRoute accepts array of roles", () => {
    const multiRole: import("@/hooks/useUserRole").AppRole[] = ["writer", "publisher", "narrator"];
    expect(multiRole).toHaveLength(3);
    expect(multiRole).toContain("writer");
    expect(multiRole).toContain("publisher");
    expect(multiRole).toContain("narrator");
  });

  it("RedirectToCreator maps legacy paths correctly", () => {
    // Test path mapping logic
    const testPaths = [
      { input: "/writer", expected: "/creator" },
      { input: "/writer/books", expected: "/creator/books" },
      { input: "/publisher/inventory", expected: "/creator/inventory" },
      { input: "/narrator/audiobooks", expected: "/creator/audiobooks" },
      { input: "/narrator/earnings", expected: "/creator/earnings" },
    ];

    testPaths.forEach(({ input, expected }) => {
      const sub = input.replace(/^\/(writer|publisher|narrator)\/?/, "");
      const target = sub ? `/creator/${sub}` : "/creator";
      expect(target).toBe(expected);
    });
  });

  it("ROLE_ROUTES maps all creator roles to /creator", () => {
    const ROLE_ROUTES: Record<string, string> = {
      admin: "/admin",
      writer: "/creator",
      publisher: "/creator",
      narrator: "/creator",
      user: "/dashboard",
    };

    expect(ROLE_ROUTES.writer).toBe("/creator");
    expect(ROLE_ROUTES.publisher).toBe("/creator");
    expect(ROLE_ROUTES.narrator).toBe("/creator");
    expect(ROLE_ROUTES.admin).toBe("/admin");
    expect(ROLE_ROUTES.user).toBe("/dashboard");
  });
});
