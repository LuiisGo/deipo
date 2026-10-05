import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const login = async (page: Page) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("founder@example.test");
  await page.getByLabel("Contraseña").fill("fixture-password");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/admin$/);
};
test.describe("Command Center with isolated real PostgreSQL", () => {
  test.skip(
    !process.env.DEIPO_TEST_DATABASE_URL,
    "Requires disposable SQL fixture; no synthetic dashboard fallback",
  );
  test("empty CURRENT, real paid queue, mobile accessibility and reload", async ({
    page,
    request,
  }) => {
    await request.get("http://127.0.0.1:54329/reset");
    await login(page);
    await page.getByRole("link", { name: "Operaciones", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Sin drop actual" }),
    ).toBeVisible();
    await request.get("http://127.0.0.1:54329/ops-current");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Operations fixture" }),
    ).toBeVisible();
    await expect(page.locator(".admin-ops-queue li")).not.toHaveCount(0);
    await expect(page.locator(".admin-inventory")).toContainText("2 / 80");
    await expect(page.locator("body")).not.toContainText("PII_SENTINEL");
    await expect(page.locator("body")).not.toContainText("55551234");
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.screenshot({
        path: `test-results/admin/operations-${width}.png`,
        fullPage: true,
      });
    }
    await page.getByRole("button", { name: "Actualizar", exact: true }).click();
    await expect(page.locator(".admin-ops-queue li")).not.toHaveCount(0);
  });
  test("anonymous direct-entry and deactivated founder are denied", async ({
    page,
    request,
    context,
  }) => {
    await request.get("http://127.0.0.1:54329/reset");
    await page.goto("/admin/operations");
    await expect(page).toHaveURL(/\/admin\/login/);
    expect(
      (await context.cookies()).some(
        (c) => c.name === "deipo_checkout_session",
      ),
    ).toBe(false);
    await login(page);
    await request.get("http://127.0.0.1:54329/deactivate");
    await page.goto("/admin/operations");
    await expect(page).toHaveURL(/error=denied/);
  });
  test("database failure exposes no fake zero metrics", async ({
    page,
    request,
  }) => {
    await request.get("http://127.0.0.1:54329/reset");
    await login(page);
    await request.get("http://127.0.0.1:54329/ops-error");
    await page.goto("/admin/operations");
    await expect(page.locator(".admin-ops-states")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Sin drop actual" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Reintentar" }),
    ).toBeVisible();
  });
});
