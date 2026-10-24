/**
 * Self-test E2E — 055: atajos de teclado y la barra Ctrl+K, con el teclado
 * real de Playwright. Guion: tests/e2e/us-atajos.md.
 *
 * Requiere la app viva con WA_MOCK_ENABLED=true. `E2E_EMAIL` / `E2E_PASSWORD`
 * para entrar con una cuenta que ya exista. `TEMA=dark` y `CAPTURAS_DIR` para
 * las capturas.
 *
 * Uso: node --env-file=<env> scripts/e2e-atajos.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "e2e-atajos@vocero.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "password-e2e-atajos";
const TEMA = process.env.TEMA === "dark" ? "dark" : "light";
const SALIDA = process.env.CAPTURAS_DIR ?? ".tmp";
const S = Date.now().toString(36);
const PN = `PN-ATJ-${S}`;

let failures = 0;
let checks = 0;
function ok(name, cond, extra = "") {
  checks++;
  if (cond) console.log(`  OK  ${name}`);
  else {
    failures++;
    console.log(`  FALLA  ${name}${extra ? ` — ${extra}` : ""}`);
  }
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 10000) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > fin) return v;
    await espera(200);
  }
}

mkdirSync(SALIDA, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
await ctx.addCookies([{ name: "vocero-theme", value: TEMA, url: BASE }]);
const req = ctx.request;
const errores = [];

try {
  console.log("== Preparación ==");
  let r = await req.post(`${BASE}/api/auth/sign-up/email`, {
    headers: { origin: BASE },
    data: { email: EMAIL, password: PASSWORD, name: "Dueña" },
  });
  if (!r.ok())
    r = await req.post(`${BASE}/api/auth/sign-in/email`, {
      headers: { origin: BASE },
      data: { email: EMAIL, password: PASSWORD },
    });
  ok("login", r.ok());
  await req.put(`${BASE}/api/settings/whatsapp`, { data: { wabaId: "WABA-ATJ", phoneNumberId: PN, token: "tok-atj" } });
  const NOMBRES = [`Ana Atajos ${S}`, `Beto Atajos ${S}`, `José Atajos ${S}`];
  for (const [i, name] of NOMBRES.entries()) {
    await req.post(`${BASE}/api/dev/wa-mock/inbound`, {
      data: { phoneNumberId: PN, from: `5215557${i}${Math.floor(100000 + Math.random() * 899999)}`, name, text: `Hola, soy ${name}` },
    });
    await espera(300);
  }
  const convs = await hasta(async () => {
    const l = (await (await req.get(`${BASE}/api/conversations`)).json()).conversations ?? [];
    const m = NOMBRES.map((n) => l.find((c) => c.contact.name === n));
    return m.every(Boolean) ? m : null;
  });
  ok("las tres conversaciones existen", Boolean(convs));

  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push(e.message));
  const barra = page.getByRole("dialog", { name: "Barra de comandos" });
  const ayuda = page.getByRole("dialog", { name: "Atajos de teclado" });
  const enHilo = (texto) => page.locator("[data-message-id]").filter({ hasText: texto });

  console.log("\n== AC1 · Ctrl+K ==");
  await page.goto(`${BASE}/pipeline`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.keyboard.press("Control+K");
  ok("Ctrl+K abre la barra desde Pipeline", await hasta(() => barra.isVisible(), 5000));
  await page.keyboard.type(`jose atajos ${S}`);
  const opcion = barra.getByRole("option").filter({ hasText: NOMBRES[2] });
  ok("sin acentos encuentra a «José»", await hasta(async () => (await opcion.count()) === 1, 8000));
  await page.screenshot({ path: `${SALIDA}/055-barra-${TEMA}.png` });
  await page.keyboard.press("Enter");
  ok(
    "Enter abre su conversación en la Bandeja",
    Boolean(await hasta(async () => page.url().includes("/inbox") && (await enHilo(`Hola, soy ${NOMBRES[2]}`).count()) === 1, 15000)),
    page.url()
  );
  await page.keyboard.press("Control+K");
  await barra.waitFor();
  await page.keyboard.type("pipe");
  await page.keyboard.press("Enter");
  ok("«pipe» y Enter lleva a Pipeline", Boolean(await hasta(async () => new URL(page.url()).pathname === "/pipeline", 10000)), page.url());
  await page.keyboard.press("Control+K");
  await barra.waitFor();
  await page.keyboard.press("Escape");
  ok("Escape cierra la barra", (await barra.count()) === 0);

  console.log("\n== AC2 · «?» ==");
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press("Shift+?");
  ok("«?» abre la ayuda", await hasta(() => ayuda.isVisible(), 5000));
  const filas = await ayuda.locator("dt").allInnerTexts();
  ok("con todos los atajos", filas.length === 7, JSON.stringify(filas));
  await page.screenshot({ path: `${SALIDA}/055-ayuda-${TEMA}.png` });
  await page.keyboard.press("Escape");
  ok("Escape la cierra", (await ayuda.count()) === 0);

  console.log("\n== AC3 · la lista de la Bandeja ==");
  await page.goto(`${BASE}/inbox`);
  const buscador = page.getByLabel("Buscar conversación");
  await buscador.waitFor({ timeout: 20000 });
  await page.getByText(NOMBRES[0]).first().waitFor({ timeout: 20000 });
  // Un filtro puesto: solo las tres de esta corrida.
  await buscador.fill(`Atajos ${S}`);
  await espera(400);
  const orden = (await page.locator("ul > li button").allInnerTexts()).map((t) => NOMBRES.find((n) => t.includes(n))).filter(Boolean);
  ok("la búsqueda deja las tres", orden.length === 3, JSON.stringify(orden));
  const activa = async () => {
    const t = await page.locator('ul > li button[aria-current="true"]').innerText().catch(() => "");
    return NOMBRES.find((n) => t.includes(n)) ?? null;
  };
  await page.keyboard.press("Alt+J");
  ok("Alt+J (con el foco en el buscador) abre la primera de la lista", Boolean(await hasta(async () => (await activa()) === orden[0])), String(await activa()));
  await page.keyboard.press("Alt+J");
  ok("Alt+J otra vez, la segunda", Boolean(await hasta(async () => (await activa()) === orden[1])), String(await activa()));
  await page.keyboard.press("Alt+K");
  ok("Alt+K vuelve a la primera", Boolean(await hasta(async () => (await activa()) === orden[0])), String(await activa()));
  await page.keyboard.press("Alt+K");
  await espera(400);
  ok("en el extremo no da la vuelta", (await activa()) === orden[0]);
  await page.locator("[data-message-id]").first().click();
  await page.keyboard.press("/");
  ok("«/» fuera de un campo enfoca el buscador", Boolean(await hasta(() => buscador.evaluate((el) => el === document.activeElement), 3000)));

  console.log("\n== AC4 · AC5 · el compositor ==");
  const respuesta = page.getByPlaceholder("Escribe una respuesta");
  const nota = page.getByLabel("Nota interna", { exact: true });
  await page.keyboard.press("Alt+N");
  ok("Alt+N pasa a «Nota interna» con el foco en la caja", Boolean(await hasta(() => nota.evaluate((el) => el === document.activeElement), 3000)));
  await page.keyboard.press("Alt+R");
  ok("Alt+R vuelve a «Responder» con el foco", Boolean(await hasta(() => respuesta.evaluate((el) => el === document.activeElement), 3000)));
  await page.keyboard.press("Alt+N");
  ok("y desde la caja de respuesta, Alt+N también", Boolean(await hasta(() => nota.evaluate((el) => el === document.activeElement), 3000)));
  await page.keyboard.press("Alt+R");
  await respuesta.waitFor();
  await respuesta.click();
  await page.keyboard.type("¿");
  await page.keyboard.press("Shift+?");
  await espera(300);
  ok("«?» en el compositor se escribe y no abre la ayuda", (await ayuda.count()) === 0 && (await respuesta.inputValue()).includes("?"));
  await respuesta.fill("");
  await page.keyboard.type("/");
  ok("«/» en el compositor abre las respuestas rápidas", Boolean(await hasta(async () => (await page.getByTestId("menu-respuestas-rapidas").count()) === 1, 3000)));
  ok("y el foco sigue en el compositor", await respuesta.evaluate((el) => el === document.activeElement));
  await respuesta.fill("");

  console.log("\n== AC6 · celular ==");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press("Control+K");
  await barra.waitFor();
  const caja = await barra.boundingBox();
  ok(
    "a 390 px la barra cabe",
    Boolean(caja && caja.x >= 0 && caja.x + caja.width <= 390) &&
      (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)),
    JSON.stringify(caja)
  );
  await page.screenshot({ path: `${SALIDA}/055-barra-390-${TEMA}.png` });
  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 300 } }).catch(() => {});
  await page.keyboard.press("Shift+?");
  await ayuda.waitFor({ timeout: 5000 }).catch(() => {});
  const cajaAyuda = await ayuda.boundingBox();
  ok("y la ayuda también", Boolean(cajaAyuda && cajaAyuda.x >= 0 && cajaAyuda.x + cajaAyuda.width <= 390), JSON.stringify(cajaAyuda));
} finally {
  ok("sin errores de la página", errores.length === 0, errores.join(" | "));
  await browser.close();
}

console.log(`\n${checks - failures}/${checks} checks en verde`);
process.exit(failures > 0 ? 1 : 0);
