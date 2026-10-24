/**
 * Self-test E2E — 054: los eventos en el hilo (cambios de etapa y traspaso a
 * una persona). Guion: tests/e2e/us-eventos-hilo.md.
 *
 * Requiere la app viva con WA_MOCK_ENABLED=true y BOT_API_KEY (para el
 * traspaso por `/api/bot/handoff`). `E2E_EMAIL` / `E2E_PASSWORD` para entrar
 * con una cuenta que ya exista. `TEMA=dark` y `CAPTURAS_DIR` para las capturas.
 *
 * Uso: node --env-file=<env> scripts/e2e-eventos-hilo.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "e2e-eventos@vocero.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "password-e2e-eventos";
const BOT_KEY = process.env.BOT_API_KEY ?? "";
const TEMA = process.env.TEMA === "dark" ? "dark" : "light";
const SALIDA = process.env.CAPTURAS_DIR ?? ".tmp";
const S = Date.now().toString(36);
const PN = `PN-EVT-${S}`;

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
async function hasta(fn, ms = 15000) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > fin) return v;
    await espera(250);
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
  const yo = (await (await req.get(`${BASE}/api/auth/get-session`)).json())?.user?.name ?? "";
  await req.put(`${BASE}/api/settings/whatsapp`, { data: { wabaId: "WABA-EVT", phoneNumberId: PN, token: "tok-evt" } });

  const NOMBRE = `Eventos ${S}`;
  await req.post(`${BASE}/api/dev/wa-mock/inbound`, {
    data: { phoneNumberId: PN, from: `52155561${Math.floor(1000 + Math.random() * 8999)}`, name: NOMBRE, text: `Hola, me interesa ${S}` },
  });
  const tablero = await hasta(async () => {
    const t = await (await req.get(`${BASE}/api/pipeline/board`)).json();
    const lead = t.leads?.find((l) => l.contact.name === NOMBRE && l.conversationId);
    return lead ? { ...t, lead } : null;
  });
  ok("la conversación tiene su lead en el embudo", Boolean(tablero));
  const { lead } = tablero;
  const conv = lead.conversationId;
  const etapa = (kind, i = 0) => tablero.stages.filter((s) => s.kind === kind)[i];
  const abierta = tablero.stages.filter((s) => s.kind === "open" && s.id !== lead.stageId)[0];
  const perdida = etapa("lost");

  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push(e.message));
  await page.goto(`${BASE}/inbox?conversation=${conv}`);
  await page.getByText(`Hola, me interesa ${S}`).last().waitFor({ timeout: 20000 });
  const eventos = page.locator("[data-evento-id]");
  const textos = async () => (await eventos.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());

  console.log("\n== AC2 · el nacimiento del lead ==");
  ok(
    "el hilo dice «Entró al embudo en …»",
    Boolean(await hasta(async () => (await textos()).some((t) => t.startsWith("Entró al embudo en")), 8000)),
    JSON.stringify(await textos())
  );

  console.log("\n== AC1 · mover el lead, en vivo ==");
  const noLeidasAntes = (await (await req.get(`${BASE}/api/conversations`)).json()).conversations.find((c) => c.id === conv)?.unreadCount;
  r = await req.patch(`${BASE}/api/pipeline/leads/${lead.id}`, { data: { stageId: abierta.id } });
  ok("el pipeline mueve el lead", r.ok(), String(r.status()));
  const esperado = `Pasó a ${abierta.name} · por ${yo}`;
  ok(
    `el hilo pinta «${esperado}» sin recargar`,
    Boolean(await hasta(async () => (await textos()).some((t) => t.startsWith(esperado)), 10000)),
    JSON.stringify(await textos())
  );
  r = await req.patch(`${BASE}/api/pipeline/leads/${lead.id}`, { data: { stageId: perdida.id, lossReason: "precio" } });
  ok(
    "pasar a perdido lleva el motivo",
    r.ok() && Boolean(await hasta(async () => (await textos()).some((t) => t.startsWith(`Pasó a ${perdida.name} · Le pareció caro`)), 10000)),
    JSON.stringify(await textos())
  );

  console.log("\n== AC4 · no son mensajes ==");
  ok("los eventos no traen botones", (await eventos.locator("button").count()) === 0);
  const noLeidasDespues = (await (await req.get(`${BASE}/api/conversations`)).json()).conversations.find((c) => c.id === conv)?.unreadCount;
  ok("no cuentan como no leídos", noLeidasDespues === noLeidasAntes, `${noLeidasAntes} → ${noLeidasDespues}`);

  console.log("\n== AC3 · el traspaso a una persona ==");
  if (BOT_KEY) {
    r = await req.post(`${BASE}/api/bot/handoff`, {
      headers: { "x-api-key": BOT_KEY },
      data: { conversationId: conv, reason: "cliente" },
    });
    ok("el cerebro pasa la conversación a una persona", r.ok(), String(r.status()));
    ok(
      "el hilo dice «La IA se pausó: el cliente pidió un humano»",
      Boolean(await hasta(async () => (await textos()).some((t) => t.startsWith("La IA se pausó: el cliente pidió un humano")), 10000)),
      JSON.stringify(await textos())
    );
    await page.screenshot({ path: `${SALIDA}/054-eventos-${TEMA}.png` });
    r = await req.patch(`${BASE}/api/conversations/${conv}`, { data: { reactivate: true } });
    ok(
      "al reactivar la IA, esa línea se va",
      r.ok() && Boolean(await hasta(async () => !(await textos()).some((t) => t.startsWith("La IA se pausó")), 10000)),
      JSON.stringify(await textos())
    );
  } else {
    ok("hay BOT_API_KEY para probar el traspaso", false);
  }

  console.log("\n== AC5 · lo ajeno ==");
  const ajeno = await req.get(`${BASE}/api/conversations/cv_no_existe/eventos`);
  ok("una conversación ajena es 404", ajeno.status() === 404);
  const cuerpo = await (await req.get(`${BASE}/api/conversations/${conv}/eventos`)).text();
  ok("la respuesta no trae correos", !cuerpo.includes("@"), cuerpo.slice(0, 200));

  console.log("\n== AC6 · celular ==");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByText(`Hola, me interesa ${S}`).last().waitFor({ timeout: 20000 });
  await eventos.first().waitFor({ timeout: 10000 });
  ok("a 390 px no desborda", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: `${SALIDA}/054-eventos-390-${TEMA}.png` });
} finally {
  ok("sin errores de la página", errores.length === 0, errores.join(" | "));
  await browser.close();
}

console.log(`\n${checks - failures}/${checks} checks en verde`);
process.exit(failures > 0 ? 1 : 0);
