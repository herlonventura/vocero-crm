/**
 * Self-test E2E de comportamiento — avisos de mensaje nuevo y compositor sin
 * ubicación ni contacto (spec 045, guion tests/e2e/us-avisos.md).
 *
 * El sonido se cuenta reemplazando `AudioContext` antes de que cargue la
 * página: cada aviso son dos notas (dos osciladores). Ningún mensaje sale a
 * Meta.
 *
 * Uso: node --env-file=.env scripts/e2e-avisos.mjs
 * Requiere: app corriendo con WA_MOCK_ENABLED=true y BD migrada.
 */
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const PN = "PN-AVISOS-1";
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

// Un AudioContext de mentira que cuenta las notas que se tocan.
await ctx.addInitScript(() => {
  window.__notas = 0;
  class ContextoFalso {
    constructor() {
      this.state = "suspended";
      this.currentTime = 0;
      this.destination = {};
    }
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
    createOscillator() {
      return {
        type: "sine",
        frequency: { value: 0 },
        connect: (n) => n,
        start: () => {
          window.__notas++;
        },
        stop() {},
      };
    }
    createGain() {
      return {
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect: (n) => n,
      };
    }
  }
  window.AudioContext = ContextoFalso;
});

console.log("== Setup: operador, conexión y dos conversaciones ==");
const email = process.env.E2E_EMAIL ?? "e2e@vocero.test";
const password = process.env.E2E_PASSWORD ?? "password-e2e-123";
let su = await req.post(`${BASE}/api/auth/sign-up/email`, {
  data: { email, password, name: "Operador E2E" },
});
if (!su.ok()) su = await req.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password } });
ok("registro o login del operador", su.ok());
const conn = await req.put(`${BASE}/api/settings/whatsapp`, {
  data: { wabaId: "WABA-AVISOS", phoneNumberId: PN, token: "tok-avisos" },
});
ok("conexión WhatsApp guardada", conn.ok());

const rnd = () => Math.floor(1000 + Math.random() * 8999);
const A = { name: `AvisoA${S}`, from: `52155553${rnd()}` };
const B = { name: `AvisoB${S}`, from: `52155554${rnd()}` };
let n = 0;
const entra = (quien, text = `hola ${++n} ${S}`) =>
  req.post(`${BASE}/api/dev/wa-mock/inbound`, {
    data: { phoneNumberId: PN, from: quien.from, name: quien.name, text },
  });
await entra(A);
await entra(B);
let convs = [];
await until(async () => {
  const d = await (await req.get(`${BASE}/api/conversations`)).json();
  convs = d.conversations ?? [];
  return [A, B].every((q) => convs.some((c) => c.contact.name === q.name));
}, 60000);
ok("las dos conversaciones existen", [A, B].every((q) => convs.some((c) => c.contact.name === q.name)));
// Que solo cuenten las de este guion: las demás de la base, leídas.
for (const c of convs) {
  if (c.unreadCount > 0 && ![A.name, B.name].includes(c.contact.name)) {
    await req.patch(`${BASE}/api/conversations/${c.id}`, { data: { markRead: true } });
  }
}

const page = await ctx.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(e.message));
await page.goto(`${BASE}/inbox`);
const notas = () => page.evaluate(() => window.__notas);
const titulo = () => page.title();

console.log("\n== Título de la pestaña ==");
ok(
  "con dos chats sin leer dice «(2) …»",
  await until(async () => (await titulo()).startsWith("(2) "), 10000),
  await titulo()
);

// El primer clic despierta el audio (antes el navegador no deja sonar).
await page.getByText(A.name).first().click();
const box = page.getByPlaceholder("Escribe una respuesta");
await box.waitFor({ timeout: 20000 });
ok(
  "abrir un chat lo marca leído y el título baja a «(1) …»",
  await until(async () => (await titulo()).startsWith("(1) "), 10000),
  await titulo()
);

console.log("\n== Compositor: sin ubicación ni contacto ==");
ok("no hay botón de ubicación", (await page.getByRole("button", { name: "Enviar ubicación" }).count()) === 0);
ok("no hay botón de contacto", (await page.getByRole("button", { name: "Compartir contacto" }).count()) === 0);
ok("el clip sigue", await page.getByRole("button", { name: "Adjuntar archivo" }).isVisible());
ok("los emojis siguen", (await page.getByRole("button", { name: /emoji/i }).count()) > 0);

console.log("\n== Sonido ==");
let antes = await notas();
await entra(B);
ok(
  "un mensaje en otro chat suena (dos notas)",
  await until(async () => (await notas()) === antes + 2, 8000),
  `notas=${(await notas()) - antes}`
);
ok(
  "y el título lo cuenta como un chat sin leer",
  await until(async () => (await titulo()).startsWith("(1) "), 5000),
  await titulo()
);

await sleep(1700);
antes = await notas();
await page.bringToFront();
const conFoco = await page.evaluate(() => document.visibilityState === "visible" && document.hasFocus());
await entra(A);
await until(async () => (await page.getByText(`hola ${n} ${S}`).count()) > 0, 8000);
await sleep(800);
if (conFoco) {
  ok("un mensaje en el chat que estás mirando no suena", (await notas()) === antes, `notas=${(await notas()) - antes}`);
} else {
  console.log("  · (el navegador sin foco: no se puede comprobar el chat abierto)");
}

await sleep(1700);
antes = await notas();
await Promise.all([entra(B), entra(B), entra(B)]);
await sleep(2500);
ok("una ráfaga de tres mensajes suena una sola vez", (await notas()) === antes + 2, `notas=${(await notas()) - antes}`);

await sleep(1700);
antes = await notas();
await box.fill(`respuesta ${S}`);
await page.getByRole("button", { name: "Enviar", exact: true }).click();
await until(async () => (await page.getByText(`respuesta ${S}`).count()) > 0, 8000);
await sleep(1500);
ok("lo que mandas tú no suena", (await notas()) === antes);

console.log("\n== Silenciar ==");
const campana = page.getByRole("button", { name: /^Sonido de mensajes/ });
ok("la campana dice activado", (await campana.getAttribute("aria-label")) === "Sonido de mensajes: activado");
await campana.click();
ok("un clic la silencia", (await campana.getAttribute("aria-label")) === "Sonido de mensajes: silenciado");
await sleep(1700);
antes = await notas();
await entra(B);
await sleep(2500);
ok("silenciado, un mensaje nuevo no suena", (await notas()) === antes);
await page.reload();
await page.getByText(A.name).first().click();
ok(
  "al recargar sigue silenciado",
  (await page.getByRole("button", { name: /^Sonido de mensajes/ }).getAttribute("aria-label")) ===
    "Sonido de mensajes: silenciado"
);
await page.getByRole("button", { name: /^Sonido de mensajes/ }).click();

console.log("\n== Fuera de la Bandeja ==");
await page.getByRole("link", { name: "Pipeline" }).click();
await page.waitForURL(/\/pipeline/);
ok(
  "en otra pantalla el título sigue contando",
  await until(async () => /^\(\d+\) /.test(await titulo()), 8000),
  await titulo()
);
await sleep(1700);
antes = await notas();
await entra(A);
ok(
  "y un mensaje nuevo suena también ahí",
  await until(async () => (await notas()) === antes + 2, 8000),
  `notas=${(await notas()) - antes}`
);

console.log("\n== El hilo abre en el último mensaje ==");
// Una conversación corta con una foto que tarda: antes se quedaba en el
// primer mensaje (al bajar todavía cabía todo, y la foto lo hacía crecer).
const F = { name: `AvisoFoto${S}`, from: `52155555${rnd()}` };
for (let i = 1; i <= 9; i++) await entra(F, `línea ${i} ${S}`);
await req.post(`${BASE}/api/dev/wa-mock/inbound`, {
  data: { phoneNumberId: PN, from: F.from, name: F.name, type: "image", mediaId: `media-imagen-${S}`, mimeType: "image/png" },
});
await entra(F, `última ${S}`);
await until(async () => {
  const d = await (await req.get(`${BASE}/api/conversations`)).json();
  return (d.conversations ?? []).some((c) => c.contact.name === F.name);
}, 30000);
await sleep(2500);
await page.route("**/api/media/**", async (route) => {
  await sleep(1500);
  await route.continue();
});
const alFondo = () =>
  page.evaluate(() => {
    const el = document.querySelector(".thread-bg");
    return el ? el.scrollHeight - el.scrollTop - el.clientHeight : -1;
  });
await page.getByRole("link", { name: /Bandeja/ }).click();
await page.waitForURL(/\/inbox/);
await page.getByText(F.name).first().click();
await page.getByText(`última ${S}`).last().waitFor({ timeout: 15000 });
await sleep(3500);
ok("con una foto que tarda, abre abajo", Math.abs(await alFondo()) < 4, `faltan ${await alFondo()} px`);
await page.getByRole("link", { name: "Pipeline" }).click();
await page.waitForURL(/\/pipeline/);
await page.getByRole("link", { name: /Bandeja/ }).click();
await page.waitForURL(/\/inbox/);
await page.getByText(F.name).first().click();
await page.getByText(`última ${S}`).last().waitFor({ timeout: 15000 });
await sleep(3500);
ok("al salir a otra pantalla y volver, también", Math.abs(await alFondo()) < 4, `faltan ${await alFondo()} px`);
await page.evaluate(() => {
  const el = document.querySelector(".thread-bg");
  if (el) el.scrollTop = 0;
});
await sleep(300);
await page.evaluate(() => {
  const img = document.querySelector('.thread-bg img');
  if (img) img.style.minHeight = "500px";
});
await sleep(500);
ok(
  "si subiste a leer, crecer el hilo no te baja",
  await page.evaluate(() => document.querySelector(".thread-bg")?.scrollTop === 0),
  JSON.stringify(
    await page.evaluate(() => {
      const el = document.querySelector(".thread-bg");
      return { top: el?.scrollTop, max: el ? el.scrollHeight - el.clientHeight : null };
    })
  )
);
await page.unroute("**/api/media/**");

ok("sin errores de página", errores.length === 0, errores.join(" | "));

await browser.close();
console.log(`\n${checks - failures}/${checks} verificaciones en verde`);
process.exit(failures ? 1 : 0);
