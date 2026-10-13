import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const enabled = !!process.env.DEIPO_TEST_DATABASE_URL;
async function login(page: Page, role: string) {
  await page.goto("/ops/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`${role}@ops.example.test`);
  await page.getByLabel("Contraseña", { exact: true }).fill("fixture-password");
  await page
    .getByRole("button", { name: "INICIAR SESIÓN", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/ops/${role}$`));
}
async function founder(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email", { exact: true }).fill("founder@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("fixture-password");
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin$/);
}
async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const r = await fetch("/api/ops");
    return r.json();
  });
}
async function operation(page: Page, body: Record<string, unknown>) {
  return page.evaluate(async (body) => {
    const r = await fetch("/api/ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  }, body);
}
test.describe("04B real PostgreSQL staff workflows", () => {
  test.skip(
    !enabled,
    "Requires disposable PostgreSQL and the 04B 80-unit fixture",
  );
  test.beforeEach(async ({ request }) => {
    await request.get("http://127.0.0.1:54329/reset");
  });
  test("fresh Ops login and inactive account fail closed", async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const response = await page.goto("/ops/login");
    expect(response?.status()).toBe(200);
    expect(
      (await context.cookies()).some(
        (c) => c.name === "deipo_checkout_session",
      ),
    ).toBe(false);
    await page.getByLabel("Email").fill("inactive@ops.example.test");
    await page.getByLabel("Contraseña").fill("fixture-password");
    await page.getByRole("button", { name: "INICIAR SESIÓN" }).click();
    await expect(page.locator("main [role=alert]")).toContainText(
      "no tiene acceso operativo activo",
    );
    const r = await page.request.post("/api/ops/staff", {
      headers: { Origin: "http://127.0.0.1:3002" },
      data: { action: "invite" },
    });
    expect(r.status()).toBe(403);
  });
  test("Kitchen mobile: 80-unit queue, PII whitelist, filters and no horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const started = Date.now();
    await login(page, "kitchen");
    await expect(
      page.getByRole("heading", { name: "A cocinar." }),
    ).toBeVisible();
    await expect(page.getByText("80 unidades activas")).toBeVisible();
    expect(Date.now() - started).toBeLessThan(15000);
    const data = await snapshot(page);
    expect(data.queue).toHaveLength(40);
    expect(data.waves[0].planned_units).toBe(80);
    const dto = JSON.stringify(data);
    for (const value of [
      "logistics",
      "PII_SENTINEL",
      "ADDRESS_SENTINEL",
      "phone",
      "email",
      "latitude",
      "order_id",
      "provider",
    ])
      expect(dto).not.toContain(value);
    const code = data.queue[0].order_code;
    await page.getByLabel("Buscar código").fill(code);
    await expect(page.locator(".ops-order")).toHaveCount(1);
    await page.getByLabel("Buscar código").fill("");
    await page
      .getByLabel("Horario", { exact: true })
      .selectOption(data.queue[0].slot_start_at);
    expect(await page.locator(".ops-order").count()).toBeLessThan(40);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    const denied = await operation(page, {
      action: "sync",
      dropId: data.dropId,
    });
    expect(denied.status).toBe(403);
    await page.screenshot({
      path: "/private/tmp/deipo-04b-kitchen-mobile.png",
      fullPage: false,
    });
  });
  test("Kitchen bulk selection assigns and preps two queued orders in two requests", async ({
    page,
  }) => {
    await founder(page);
    const data = await snapshot(page);
    const orders = data.queue
      .filter((o: { method: string }) => o.method === "pickup")
      .slice(0, 2);
    for (const o of orders)
      expect(
        (
          await operation(page, {
            action: "transition",
            id: o.id,
            version: o.version,
            to: "queued",
            override: true,
            reason: "Local UI bulk verification",
          })
        ).status,
      ).toBe(200);
    await page.context().clearCookies();
    await login(page, "kitchen");
    await page.getByLabel("Estado", { exact: true }).selectOption("queued");
    await page.getByLabel("Seleccionar pedidos en cola visibles").check();
    await expect(
      page.getByText("2 pedidos · 4 unidades seleccionadas"),
    ).toBeVisible();
    await page.getByLabel("Tanda destino").selectOption(data.waves[0].id);
    await page.getByRole("button", { name: "APLICAR A SELECCIÓN" }).click();
    await expect(page.getByRole("status")).toContainText("Guardado");
    await page.getByLabel("Seleccionar pedidos en cola visibles").check();
    await page.getByLabel("Acción", { exact: true }).selectOption("prep");
    await page.getByRole("button", { name: "APLICAR A SELECCIÓN" }).click();
    await expect(page.locator(".ops-order")).toHaveCount(0);
  });
  test("Packing mobile: checklist and seal required; manual code handoff completes pickup", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "fulfillment");
    const data = await snapshot(page);
    const o = data.queue.find(
      (o: { method: string; status: string }) =>
        o.method === "pickup" && o.status === "in_prep",
    );
    await page.getByLabel("Buscar código").fill(o.order_code);
    await expect(
      page.getByRole("button", { name: "EMPACADO Y SELLADO" }),
    ).toBeDisabled();
    for (let i = 0; i < o.packing.length; i++) {
      await page
        .getByRole("button", { name: "COMPLETO", exact: true })
        .filter({ visible: true })
        .nth(i)
        .click();
      await expect(
        page.getByRole("button", { name: "ACTUALIZAR", exact: true }),
      ).toBeEnabled();
    }
    await page.getByLabel("Sello naranja colocado").check();
    await page.getByRole("button", { name: "EMPACADO Y SELLADO" }).click();
    await expect(
      page.getByRole("button", { name: "MARCAR LISTO" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "MARCAR LISTO" }).click();
    await expect(
      page.getByRole("button", { name: "CONFIRMAR ENTREGA PICKUP" }),
    ).toBeVisible();
    await page.getByText("BUSCAR POR QR / CÓDIGO", { exact: true }).click();
    await page.getByLabel("Código o enlace QR").fill(o.order_code);
    await page.getByRole("button", { name: "BUSCAR PEDIDO" }).click();
    await expect(page.getByRole("status")).toContainText("Búsqueda");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: "/private/tmp/deipo-04b-packing-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "CONFIRMAR ENTREGA PICKUP" })
      .click();
    await expect(
      page.locator(".ops-ticket").getByText("Entregado", { exact: true }),
    ).toBeVisible();
  });
  test("Driver: assigned delivery only, issue handling and valid delivery lifecycle", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "fulfillment");
    const staff = await snapshot(page);
    const assigned = staff.queue.find(
      (o: { driver_user_id?: string }) => !!o.driver_user_id,
    );
    expect(assigned).toBeTruthy();
    let version = assigned.version;
    for (const p of assigned.packing) {
      const r = await operation(page, {
        action: "check",
        id: assigned.id,
        version,
        component: p.code,
        quantity: p.required,
      });
      expect(r.status).toBe(200);
      version = r.data.result;
    }
    const pack = await operation(page, {
      action: "transition",
      id: assigned.id,
      version,
      to: "packed",
      sealed: true,
    });
    expect(pack.status).toBe(200);
    expect(
      (
        await operation(page, {
          action: "transition",
          id: assigned.id,
          version: pack.data.result,
          to: "ready",
        })
      ).status,
    ).toBe(200);
    await page.context().clearCookies();
    await login(page, "driver");
    let data = await snapshot(page);
    expect(data.queue).toHaveLength(1);
    expect(data.queue[0].id).toBe(assigned.id);
    expect(data.drivers).toHaveLength(0);
    expect(data.waves).toHaveLength(0);
    for (const v of ["revenue", "order_id", "provider"])
      expect(JSON.stringify(data)).not.toContain(v);
    await expect(
      page.getByRole("link", { name: "ABRIR MAPA" }),
    ).toHaveAttribute("href", /14\.6%2C-90\.5/);
    await page.getByText("INCIDENCIAS · 0", { exact: true }).click();
    await page
      .getByLabel("Motivo", { exact: true })
      .selectOption("customer_unreachable");
    await page
      .getByRole("button", { name: "ABRIR INCIDENCIA", exact: true })
      .click();
    await expect(
      page.getByText("INCIDENCIAS · 1", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "VER INCIDENCIAS" }).click();
    await page.getByLabel("Resolución").fill("Cliente localizado");
    await page.getByRole("button", { name: "RESOLVER", exact: true }).click();
    await expect(
      page.getByText("INCIDENCIAS · 0", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "SALIR A ENTREGA" }).click();
    await expect(
      page.getByRole("link", { name: "AVISAR EN CAMINO" }),
    ).toHaveAttribute("href", /https:\/\/wa.me\//);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: "/private/tmp/deipo-04b-driver-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "CONFIRMAR ENTREGA", exact: true })
      .click();
    data = await snapshot(page);
    expect(data.queue).toHaveLength(0);
  });
  test("Founder desktop staff, explicit sync; invite configuration fails closed", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await founder(page);
    await page.goto("/ops/fulfillment");
    await page
      .getByRole("button", { name: "SINCRONIZAR PEDIDOS PAGADOS" })
      .click();
    await expect(page.getByRole("status")).toContainText("0 incorporados");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "/private/tmp/deipo-04b-founder-desktop.png",
      fullPage: false,
    });
    await page.goto("/admin/operations/staff");
    await expect(
      page.getByRole("heading", { name: "Personas y accesos" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "INVITAR STAFF" }),
    ).toBeDisabled();
    const result = await page.request.post("/api/ops/staff", {
      headers: { Origin: "http://127.0.0.1:3002" },
      data: {
        action: "invite",
        email: "local@example.test",
        displayName: "Local",
        role: "kitchen",
        active: true,
        reason: "Local test",
      },
    });
    expect(result.status()).toBe(400);
    expect((await result.json()).error).toContain("configuración");
    await page.context().clearCookies();
    await login(page, "fulfillment");
    const denied = await page.request.post("/api/ops/staff", {
      headers: { Origin: "http://127.0.0.1:3002" },
      data: {
        action: "invite",
        email: "local@example.test",
        displayName: "Local",
        role: "kitchen",
        active: true,
        reason: "Local test",
      },
    });
    expect(denied.status()).toBe(403);
  });
});
