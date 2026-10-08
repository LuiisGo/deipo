import { test, expect, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import jsQR from "jsqr";
const fixture = "http://127.0.0.1:54329";
async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email", { exact: true }).fill("founder@example.test");
  await page.getByLabel("Contraseña", { exact: true }).fill("fixture-password");
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin$/);
}
async function order(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "COMPRAR ONLINE", exact: true })
    .click();
  await page.getByLabel("Nombre", { exact: true }).fill("Tracker Customer");
  await page.getByLabel("Teléfono con código de país").fill("+50255551234");
  await page.getByRole("button", { name: "CREAR PEDIDO PENDIENTE" }).click();
  await expect(
    page.getByRole("heading", { name: "Pedido pendiente." }),
  ).toBeVisible();
  await page.evaluate(() =>
    fetch("/api/payments/recurrente/checkout", { method: "POST" }),
  );
}
test.beforeEach(async ({ request }) => {
  await request.get(`${fixture}/reset`);
  await request.get(`${fixture}/commerce-setup`);
});
for (const width of [390, 1440])
  test(`assisted desk, no preclaim hold, same checkout and private tracker at ${width}px`, async ({
    page,
    request,
    browser,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.goto("/admin/operations/sales");
    await page.getByLabel("Nombre", { exact: true }).fill("Assisted Buyer");
    await page.getByLabel("Teléfono", { exact: true }).fill("+50255551234");
    await page.getByLabel("Cantidad", { exact: true }).fill("2");
    await page
      .getByLabel("Vencimiento del enlace (Guatemala)")
      .fill("2030-01-01T12:00");
    // Explicit local test expiry, not a launch default; within the draft security bound.
    const expiry = new Date(Date.now() + 3600000 - 21600000)
      .toISOString()
      .slice(0, 16);
    await page.getByLabel("Vencimiento del enlace (Guatemala)").fill(expiry);
    await page
      .getByRole("button", { name: "CREAR ENLACE DE PAGO", exact: true })
      .click();
    const link = page.getByLabel("Enlace privado", { exact: true });
    await expect(link).toBeVisible();
    const url = await link.inputValue();
    expect(url).toMatch(/^https:\/\/bydeipo.com\/buy\/[A-Za-z0-9_-]{43}$/);
    expect(
      (await (await request.get(`${fixture}/stats`)).json()).inventory
        .held_units,
    ).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const customer = await browser.newContext({
      baseURL: "http://127.0.0.1:3002",
      viewport: { width, height: 900 },
    });
    const buyer = await customer.newPage();
    const response = await buyer.goto(new URL(url).pathname);
    expect(response!.headers()["referrer-policy"]).toBe("no-referrer");
    await buyer.getByRole("button", { name: "REVISAR MI PEDIDO" }).click();
    await expect(buyer).toHaveURL(/\/checkout$/);
    await expect(
      buyer.getByText("Q350.00", { exact: false }).first(),
    ).toBeVisible();
    expect(
      (await (await request.get(`${fixture}/stats`)).json()).inventory
        .held_units,
    ).toBe(2);
    await buyer.evaluate(() =>
      fetch("/api/payments/recurrente/checkout", { method: "POST" }),
    );
    await request.post(`${fixture}/payment-fixture`, { data: {} });
    await buyer.goto("/success");
    await expect(
      buyer.getByRole("link", { name: "SEGUIR MI PEDIDO" }),
    ).toBeVisible();
    const tracker = await buyer
      .getByRole("link", { name: "SEGUIR MI PEDIDO" })
      .getAttribute("href");
    expect(tracker).toMatch(/\/order\/[A-Za-z0-9_-]{43}$/);
    const result = await buyer.goto(new URL(tracker!).pathname);
    expect(result!.headers()["cache-control"]).toContain("no-store");
    expect(result!.headers()["referrer-policy"]).toBe("no-referrer");
    expect(result!.headers()["x-robots-tag"]).toContain("noindex");
    await expect(buyer.getByText("CONFIRMED", { exact: true })).toBeVisible();
    await expect(buyer.getByText("ON THE WAY", { exact: true })).toHaveCount(0);
    await expect(
      buyer.getByRole("img", { name: "QR de acceso a este pedido" }),
    ).toBeVisible();
    expect(await buyer.locator("body").innerText()).not.toContain(
      "Assisted Buyer",
    );
    expect(await buyer.locator("body").innerText()).not.toContain(
      "+50255551234",
    );
    expect(
      (
        await new AxeBuilder({ page: buyer })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await buyer.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await buyer.screenshot({
      path: `/private/tmp/deipo-04c-tracker-${width}.png`,
      fullPage: true,
    });
    await customer.close();
  });
test("bank transfer pending is honest, has reservation deadline, then verified receipt", async ({
  page,
  request,
}) => {
  await order(page);
  await request.post(`${fixture}/payment-fixture`, {
    data: { status: "pending", type: "bank_transfer" },
  });
  await page.goto("/success");
  await expect(
    page.getByRole("heading", { name: "TRANSFERENCIA EN PROCESO" }),
  ).toBeVisible();
  await expect(page.getByText(/Reserva hasta/)).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Recibo de pago verificado" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "SEGUIR MI PEDIDO" }),
  ).toHaveCount(0);
  await request.post(`${fixture}/payment-fixture`, {
    data: { status: "succeeded", type: "bank_transfer" },
  });
  await page.getByRole("button", { name: "ACTUALIZAR ESTADO" }).click();
  await expect(
    page.getByRole("article", { name: "Recibo de pago verificado" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "SEGUIR MI PEDIDO" }),
  ).toBeVisible();
});
test("web receipt durable link, staff print formats, revoke and rotate", async ({
  page,
  request,
  browser,
}) => {
  await order(page);
  await request.post(`${fixture}/payment-fixture`, { data: {} });
  await page.goto("/success");
  const tracker = page.getByRole("link", { name: "SEGUIR MI PEDIDO" });
  await expect(tracker).toBeVisible();
  const first = await tracker.getAttribute("href");
  await page.reload();
  await expect(tracker).toHaveAttribute("href", first!);
  const stats = await (await request.get(`${fixture}/commerce-stats`)).json();
  expect(stats.fulfillments).toBe(1);
  const staff = await browser.newPage({ baseURL: "http://127.0.0.1:3002" });
  await login(staff);
  for (const format of ["packing", "pickup", "delivery", "sheet"]) {
    await staff.goto(`/ops/print/${stats.fulfillment_id}?format=${format}`);
    await expect(
      staff.getByRole("article", { name: "Etiqueta de pedido" }),
    ).toBeVisible();
    expect(await staff.locator(".packing-label").innerText()).not.toContain(
      "+50255551234",
    );
    await staff.emulateMedia({ media: "print" });
    await expect(staff.locator(".print-controls")).toBeHidden();
    if(format==='packing'){
      const png=await staff.getByRole('img',{name:'QR del seguimiento del pedido'}).screenshot();
      const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      expect(jsQR(new Uint8ClampedArray(data),info.width,info.height)?.data).toBe(first);
    }
    await staff.emulateMedia({ media: "screen" });
  }
  await staff.getByText("Acceso del cliente", { exact: true }).click();
  await staff
    .getByRole("button", { name: "REVOCAR ACCESO", exact: true })
    .click();
  await expect(staff.getByText("Acceso revocado.",{exact:true})).toBeVisible();
  await page.goto(new URL(first!).pathname);
  await expect(
    page.getByRole("heading", { name: "Enlace no disponible." }),
  ).toBeVisible();
  await staff
    .getByLabel("Vencimiento del acceso (Guatemala)")
    .fill(new Date(Date.now() + 3600000 - 21600000).toISOString().slice(0, 16));
  await staff.getByRole("button", { name: "EMITIR / ROTAR ENLACE" }).click();
  await expect(staff.getByLabel("Enlace del tracker")).toBeVisible();
  const rotated = await staff.getByLabel("Enlace del tracker").inputValue();
  expect(rotated).not.toBe(first);
  await page.goto("/success");
  await expect(tracker).toHaveAttribute("href", rotated);
  await staff.close();
});
test("pin geolocation and manual adjustment persist, pickup never requests location", async ({
  page,
  context,
  request,
}) => {
  const setup = await (await request.get(`${fixture}/delivery-setup`)).json();
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 14.61, longitude: -90.51 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "COMPRAR ONLINE" }).click();
  await expect(
    page.getByRole("button", { name: "USAR MI UBICACIÓN" }),
  ).toHaveCount(0);
  await page.getByLabel("Nombre", { exact: true }).fill("Pin customer");
  await page.getByLabel("Teléfono con código de país").fill("+50255551234");
  await page.locator("select[name=method]").selectOption("delivery");
  await page.locator("select[name=slot_id]").selectOption(setup.free);
  await page.locator("select[name=zone_id]").selectOption(setup.zone);
  await page
    .getByLabel("Dirección", { exact: true })
    .fill("Written delivery fixture");
  await page.getByRole("button", { name: "USAR MI UBICACIÓN" }).click();
  await expect(page.getByText(/Pin seleccionado: 14.610000/)).toBeVisible();
  await page.getByRole("button", { name: "AJUSTAR PIN MANUALMENTE" }).click();
  await page.getByLabel("Latitud", { exact: true }).fill("14.62");
  await page.getByRole("button", { name: "CREAR PEDIDO PENDIENTE" }).click();
  await expect(
    page.getByRole("heading", { name: "Pedido pendiente." }),
  ).toBeVisible();
  const stats = await (await request.get(`${fixture}/commerce-stats`)).json();
  expect(
    stats.orders.some(
      (o: { lat: number; lng: number }) => o.lat === 14.62 && o.lng === -90.51,
    ),
  ).toBe(true);
});
test("denied geolocation exposes useful manual fallback", async ({
  page,
  request,
}) => {
  await request.get(`${fixture}/delivery-setup`);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (_success: unknown, error: () => void) => error(),
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "COMPRAR ONLINE" }).click();
  await page.locator("select[name=method]").selectOption("delivery");
  await page.getByRole("button", { name: "USAR MI UBICACIÓN" }).click();
  await expect(page.locator(".pin-picker [role=alert]")).toContainText(
    "manualmente",
  );
  await expect(page.getByLabel("Latitud", { exact: true })).toBeVisible();
});
test("WhatsApp purchase CTA is a manual business deep link and claim/access CSRF fail closed", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const cta = page.getByRole("link", { name: "PEDIR POR WHATSAPP" });
  await expect(cta).toHaveAttribute(
    "href",
    /^https:\/\/wa.me\/50255551234\?text=/,
  );
  await expect(cta).toHaveAttribute("rel", "noreferrer");
  for (const path of [
    "/api/customer/access",
    "/api/customer/claim",
    "/api/ops/sales",
  ])
    expect(
      (
        await request.post(path, {
          headers: { origin: "https://evil.example" },
          data: {},
        })
      ).status(),
    ).toBe(403);
  await page.goto("/order/not-a-token");
  await expect(
    page.getByRole("heading", { name: "Enlace no disponible." }),
  ).toBeVisible();
});
