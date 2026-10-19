import { test, expect, type BrowserContext, type Page } from "@playwright/test";
const password = "Browser-test-only!";
async function login(page: Page, user: string, path = "/admin/director") {
  await page.goto(path);
  await page.getByLabel("Login", { exact: true }).fill(user);
  await page.getByLabel("Hasło", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
}
async function post(context: BrowserContext, path: string, body: unknown) {
  const me = await (await context.request.get("/api/me")).json();
  const r = await context.request.post(path, {
    data: body,
    headers: { "X-CSRF-Token": me.csrf },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
test("admin → councillor → database → approval → display and graphics", async ({
  browser,
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "admin");
  await expect(
    page.getByRole("heading", { name: "Reżyser sesji", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Rozpocznij sesję", exact: true })
    .click();
  await page.getByRole("button", { name: "Potwierdzam", exact: true }).click();
  await page
    .getByRole("button", { name: "Otwórz listę obecności", exact: true })
    .click();
  const memberContext = await browser.newContext({
    viewport: { width: 800, height: 1080 },
  });
  const member = await memberContext.newPage();
  await login(member, "radny01", "/councillor");
  await member
    .getByRole("button", { name: "Potwierdź obecność", exact: true })
    .click();
  await expect(member.getByText(/Potwierdzona o/)).toBeVisible();
  for (let i = 2; i <= 15; i++) {
    const c = await browser.newContext();
    await c.request.post("/api/login", {
      data: { username: `radny${String(i).padStart(2, "0")}`, password },
    });
    await post(c, "/api/attendance", { sessionId: "demo", present: true });
    await c.close();
  }
  await expect(
    page.getByText("Kworum osiągnięte", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("director-desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Przygotuj głosowanie", exact: true })
    .click();
  await page
    .getByLabel("Pełne pytanie głosowania")
    .fill("Czy przyjąć demonstracyjny porządek obrad?");
  await page
    .getByRole("button", { name: "Zapisz na serwerze", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Otwórz głosowanie", exact: true })
    .click();
  await page.getByRole("button", { name: "Potwierdzam", exact: true }).click();
  await member.getByRole("button", { name: "ZA", exact: true }).click();
  await expect(
    member.getByRole("heading", {
      name: "Głos zapisany na serwerze",
      exact: true,
    }),
  ).toBeVisible();
  const displayContext = await browser.newContext();
  const display = await displayContext.newPage();
  await login(display, "display", "/display");
  await expect(
    display.getByText("TRWA GŁOSOWANIE", { exact: true }),
  ).toBeVisible();
  await expect(display.getByText("PRZYJĘTO", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Zamknij głosowanie", exact: true })
    .click();
  await page.getByRole("button", { name: "Potwierdzam", exact: true }).click();
  await expect(
    member.getByText("Głosowanie zamknięte. Wynik oczekuje na zatwierdzenie."),
  ).toBeVisible();
  await expect(display.getByText("PRZYJĘTO", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Zatwierdź wynik", exact: true })
    .click();
  await page.getByRole("button", { name: "Potwierdzam", exact: true }).click();
  await expect(
    display.getByRole("heading", { name: "PRZYJĘTO", exact: true }),
  ).toBeVisible();
  await expect(display.locator(".presentation-members>div")).toHaveCount(15);
  await page.reload();
  await expect(
    page.getByText("Niezmienny wynik", { exact: false }),
  ).toBeVisible();
  const graphicsContext = await browser.newContext();
  const graphics = await graphicsContext.newPage();
  await login(graphics, "graphics", "/production/vmix/results");
  await expect(
    graphics.getByRole("heading", { name: "PRZYJĘTO", exact: true }),
  ).toBeVisible();
  const csv = await page.request.get("/api/results.csv");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect((await csv.text()).split("\r\n")).toHaveLength(16);
  await member.setViewportSize({ width: 390, height: 844 });
  await member.screenshot({
    path: testInfo.outputPath("councillor-mobile.png"),
    fullPage: true,
  });
  expect(
    await member.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await display.screenshot({
    path: testInfo.outputPath("display-result.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await memberContext.close();
  await displayContext.close();
  await graphicsContext.close();
});
