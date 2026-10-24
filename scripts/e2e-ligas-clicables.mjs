/**
 * Self-test E2E de comportamiento — ligas clicables en los mensajes (spec 040,
 * guion tests/e2e/us-ligas-clicables.md).
 *
 * Conduce la UI real con Playwright contra wa-mock: un entrante con una URL en
 * el texto, otro con la URL en el pie de una imagen, un saliente del operador y
 * un mensaje con esquemas que no deben volverse enlace.
 *
 * Uso: node --env-file=.env scripts/e2e-ligas-clicables.mjs
 * Requiere: app corriendo con WA_MOCK_ENABLED=true y BD migrada.
 */
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const PN = "PN-LIGAS-1";
const S = Math.random().toString(36).slice(2, 6).toUpperCase();

let failures = 0;
let checks = 0;
const ok = (name, cond, extra = "") => {
  checks++;
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await sleep(150);
  }
  return false;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const req = ctx.request;

console.log("== Setup: operador, conexión y una conversación ==");
const email = process.env.E2E_EMAIL ?? "e2e@vocero.test";
const password = process.env.E2E_PASSWORD ?? "password-e2e-123";
let su = await req.post(`${BASE}/api/auth/sign-up/email`, {
  data: { email, password, name: "Operador E2E" },
});
if (!su.ok()) {
  su = await req.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email, password },
  });
}
ok("registro o login del operador", su.ok());

const conn = await req.put(`${BASE}/api/settings/whatsapp`, {
  data: { wabaId: "WABA-LIGAS", phoneNumberId: PN, token: "tok-ligas" },
});
ok("conexión WhatsApp guardada", conn.ok());

const NAME = `Ligas${S}`;
const FROM = `52155520${Math.floor(1000 + Math.random() * 8999)}`;
const URL_MAPA = `https://maps.example.com/lugar-${S}`;
const TEXTO_MAPA = `Estamos aquí: ${URL_MAPA}. Te esperamos`;
const URL_PIE = `https://example.com/catalogo/${S}?pagina=2`;
const PIE = `Ficha completa (${URL_PIE})`;
const TEXTO_PELIGRO = `javascript:alert(1) y mailto:ventas@example.com ${S}`;
const inbound = (data) =>
  req.post(`${BASE}/api/dev/wa-mock/inbound`, {
    data: { phoneNumberId: PN, from: FROM, name: NAME, ...data },
  });

await inbound({ text: TEXTO_MAPA });
await inbound({
  type: "image",
  mediaId: `media-ligas-${S}`,
  mimeType: "image/jpeg",
  caption: PIE,
});
await inbound({ text: TEXTO_PELIGRO });

let conv = null;
await until(async () => {
  const d = await (await req.get(`${BASE}/api/conversations`)).json();
  conv = (d.conversations ?? []).find((c) => c.contact.name === NAME) ?? null;
  return Boolean(conv);
});
ok("conversación creada por los entrantes", Boolean(conv));
if (!conv) {
  await browser.close();
  process.exit(1);
}
const mensajes = async () =>
  (await (await req.get(`${BASE}/api/conversations/${conv.id}/messages`)).json())
    .messages ?? [];
ok(
  "llegaron los tres entrantes",
  await until(async () => (await mensajes()).length >= 3),
);

const page = await ctx.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(e.message));
await page.goto(`${BASE}/inbox`);
await page.getByText(NAME).first().click();
const box = page.getByPlaceholder("Escribe una respuesta");
await box.waitFor({ timeout: 20000 });

console.log("\n== Una URL en el texto del cliente ==");
const ligaMapa = page.locator(`a[href="${URL_MAPA}"]`);
await ligaMapa.first().waitFor({ timeout: 10000 });
ok("la URL del texto es un enlace", (await ligaMapa.count()) === 1);
ok("abre en otra pestaña", (await ligaMapa.getAttribute("target")) === "_blank");
const rel = (await ligaMapa.getAttribute("rel")) ?? "";
ok("sin opener ni referer", rel.includes("noopener") && rel.includes("noreferrer"), rel);
ok("el punto final no entra en la liga", (await ligaMapa.innerText()) === URL_MAPA);
const burbuja = ligaMapa.locator("xpath=..");
ok(
  "el texto alrededor sigue igual",
  (await burbuja.innerText()).includes("Te esperamos") &&
    (await burbuja.innerText()).startsWith("Estamos aquí:"),
);

const [popup] = await Promise.all([
  page.waitForEvent("popup", { timeout: 5000 }).catch(() => null),
  ligaMapa.click(),
]);
ok("el clic abre una pestaña nueva", popup !== null);
ok("y la bandeja se queda donde estaba", page.url().startsWith(`${BASE}/inbox`));
if (popup) await popup.close();

console.log("\n== Una URL en el pie de una imagen ==");
const ligaPie = page.locator(`a[href="${URL_PIE}"]`);
ok("la URL del pie es un enlace", await until(async () => (await ligaPie.count()) === 1, 10000));
ok("el paréntesis de cierre queda fuera", (await ligaPie.innerText()) === URL_PIE);

console.log("\n== Esquemas que no son liga ==");
// La lista de conversaciones enseña el mismo texto como vista previa: el hilo es la burbuja.
const peligro = page.locator("span.whitespace-pre-wrap", { hasText: TEXTO_PELIGRO });
await peligro.waitFor({ timeout: 10000 });
ok(
  "javascript: y mailto: se quedan como texto",
  (await peligro.locator("a").count()) === 0 &&
    (await page.locator('a[href^="javascript:"], a[href^="mailto:"]').count()) === 0,
);

console.log("\n== Una liga que escribe el operador ==");
const SALIENTE = `Te dejo la ficha: www.example.com/ficha-${S}`;
await box.fill(SALIENTE);
await box.press("Enter");
const ligaSaliente = page.locator(`a[href="https://www.example.com/ficha-${S}"]`);
ok(
  "el saliente con www. se pinta como liga https://",
  await until(async () => (await ligaSaliente.count()) === 1, 15000),
);
ok("el texto de la liga es el que escribió", (await ligaSaliente.innerText()) === `www.example.com/ficha-${S}`);

await page.reload();
await page.getByText(NAME).first().click();
await box.waitFor({ timeout: 20000 });
ok(
  "tras recargar, las ligas siguen ahí",
  await until(async () => (await page.locator(`a[href="${URL_MAPA}"]`).count()) === 1, 10000),
);
ok("sin errores de la página", errores.length === 0, errores.join(" | "));

await browser.close();
console.log(`\n${checks - failures}/${checks} comprobaciones en verde`);
process.exit(failures ? 1 : 0);
