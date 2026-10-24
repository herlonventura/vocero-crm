/**
 * Self-test E2E — 059: reenviar cualquier mensaje (texto, documento, audio) y,
 * en el celular, deslizar para responder y mantener presionado para el menú.
 * Guion: tests/e2e/us-reenviar-y-deslizar.md.
 *
 * Requiere la app viva con WA_MOCK_ENABLED=true. `E2E_EMAIL` / `E2E_PASSWORD`
 * para entrar con una cuenta que ya exista (si no, se crea). `TEMA=dark` y
 * `CAPTURAS_DIR` para guardar las capturas en ese tema y carpeta.
 *
 * Uso: node --env-file=<env> scripts/e2e-reenviar-y-deslizar.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "e2e-reenvio@vocero.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "password-e2e-reenvio";
const TEMA = process.env.TEMA === "dark" ? "dark" : "light";
const SALIDA = process.env.CAPTURAS_DIR ?? ".tmp";
const S = Date.now().toString(36);
const PN = `PN-REENV-${S}`;

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
  await req.put(`${BASE}/api/settings/whatsapp`, {
    data: { wabaId: "WABA-REENV", phoneNumberId: PN, token: "tok-reenv" },
  });

  const NOMBRES = { origen: `Origen ${S}`, destino: `Destino ${S}`, cerrada: `Cerrada ${S}` };
  const TEXTO = `Los precios son 1200 y 1500 ${S}`;
  const rnd = () => Math.floor(1000 + Math.random() * 8999);
  const tel = { origen: `52155541${rnd()}`, destino: `52155542${rnd()}`, cerrada: `52155543${rnd()}` };
  const inbound = (k, data) =>
    req.post(`${BASE}/api/dev/wa-mock/inbound`, {
      data: { phoneNumberId: PN, from: tel[k], name: NOMBRES[k], ...data },
    });
  await inbound("origen", { text: TEXTO });
  await inbound("origen", {
    type: "document",
    mediaId: `media-doc-${S}`,
    mimeType: "application/pdf",
    filename: `cotizacion-${S}.pdf`,
    caption: `La cotización ${S}`,
  });
  await inbound("origen", { type: "audio", mediaId: `media-aud-${S}`, mimeType: "audio/ogg; codecs=opus" });
  await inbound("origen", { type: "location", location: { latitude: 19.43, longitude: -99.13, name: `Aquí ${S}` } });
  await inbound("destino", { text: `Hola, soy el destino ${S}` });
  await inbound("cerrada", { text: `Hola de ayer ${S}`, timestamp: Math.floor(Date.now() / 1000) - 30 * 3600 });

  const convs = await hasta(async () => {
    const l = (await (await req.get(`${BASE}/api/conversations`)).json()).conversations ?? [];
    const m = Object.fromEntries(Object.entries(NOMBRES).map(([k, n]) => [k, l.find((c) => c.contact.name === n)]));
    return Object.values(m).every(Boolean) ? m : null;
  });
  ok("las tres conversaciones existen", Boolean(convs));
  const mensajes = async (k) =>
    (await (await req.get(`${BASE}/api/conversations/${convs[k].id}/messages`)).json()).messages ?? [];
  const delOrigen = await hasta(async () => {
    const l = await mensajes("origen");
    const m = {
      texto: l.find((x) => x.text === TEXTO),
      doc: l.find((x) => x.media?.kind === "document"),
      audio: l.find((x) => x.media?.kind === "audio"),
      ubicacion: l.find((x) => x.media?.kind === "location" || x.type === "location"),
    };
    return Object.values(m).every(Boolean) ? m : null;
  });
  ok("el origen trae texto, documento, audio y ubicación", Boolean(delOrigen));
  // Como la bandeja al pintarlos: se bajan del wa-mock.
  for (const m of [delOrigen.doc, delOrigen.audio]) await req.get(`${BASE}/api/media/${m.media.assetId}`);
  const outbox = async () => (await (await req.get(`${BASE}/api/dev/wa-mock/outbox`)).json()).outbox ?? [];
  const reenviar = (conv, body) =>
    req.post(`${BASE}/api/conversations/${conv}/messages/forward`, { data: body });

  console.log("\n== AC2 · documento y audio por la API ==");
  r = await reenviar(convs.destino.id, { sourceMessageId: delOrigen.doc.id, caption: `Pie nuevo ${S}` });
  ok("el documento sale (201)", r.status() === 201, String(r.status()));
  const salidaDoc = await hasta(async () =>
    (await outbox()).find((o) => o.body?.document?.caption === `Pie nuevo ${S}`)
  );
  ok("llega a Graph como documento con el pie editado", Boolean(salidaDoc));
  ok("con el nombre del archivo", salidaDoc?.body?.document?.filename === `cotizacion-${S}.pdf`);
  r = await reenviar(convs.destino.id, { sourceMessageId: delOrigen.audio.id });
  ok("el audio sale (201)", r.status() === 201, String(r.status()));
  const enDestino = await hasta(async () => {
    const l = await mensajes("destino");
    return l.some((m) => m.media?.kind === "document") && l.some((m) => m.media?.kind === "audio") ? l : null;
  });
  ok("en el destino hay un documento y un audio nuevos", Boolean(enDestino));
  const salidaAudio = (await outbox()).filter((o) => o.body?.type === "audio").at(-1);
  ok("el audio Ogg sale como nota de voz", salidaAudio?.body?.audio?.voice === true, JSON.stringify(salidaAudio?.body));

  console.log("\n== AC4 · AC5 · lo que se rechaza ==");
  const antes = (await outbox()).length;
  ok("una ubicación → 422", (await reenviar(convs.destino.id, { sourceMessageId: delOrigen.ubicacion.id })).status() === 422);
  ok("un origen que no existe → 404", (await reenviar(convs.destino.id, { sourceMessageId: "msg_no_existe" })).status() === 404);
  ok("a la misma conversación → 422", (await reenviar(convs.origen.id, { sourceMessageId: delOrigen.texto.id })).status() === 422);
  ok(
    "una URL en el cuerpo → 422",
    (await reenviar(convs.destino.id, { sourceMessageId: delOrigen.texto.id, url: "http://example.test/x" })).status() === 422
  );
  const cerrada = await reenviar(convs.cerrada.id, { sourceMessageId: delOrigen.texto.id });
  ok("ventana cerrada → 409 window_closed", cerrada.status() === 409 && (await cerrada.json()).error?.code === "window_closed");
  ok("nada de eso llegó a Graph", (await outbox()).length === antes);

  console.log("\n== AC1 · en la computadora ==");
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push(e.message));
  await page.goto(`${BASE}/inbox`);
  await page.getByText(NOMBRES.origen).first().click();
  await page.getByPlaceholder("Escribe una respuesta").waitFor({ timeout: 20000 });
  const filaDe = (p, id) => p.locator(`div.group:has([data-message-id="${id}"])`);
  await page.locator(`[data-message-id="${delOrigen.texto.id}"]`).waitFor();
  // La hora es un float: la burbuja tiene que contenerla (se salía en la
  // rc.1 bajo el audio, el documento y la ubicación).
  const horasFuera = await page.evaluate(() =>
    [...document.querySelectorAll("[data-message-id]")].filter((b) => {
      const hora = b.querySelector(":scope > span.float-right");
      return hora && hora.getBoundingClientRect().bottom > b.getBoundingClientRect().bottom + 0.5;
    }).length
  );
  ok("la hora queda dentro de cada burbuja (audio, documento, ubicación)", horasFuera === 0, `${horasFuera} fuera`);
  await filaDe(page, delOrigen.texto.id).hover();
  ok(
    "al pasar el ratón por el texto: «Responder» y «Reenviar»",
    (await filaDe(page, delOrigen.texto.id).getByRole("button", { name: "Responder" }).isVisible()) &&
      (await filaDe(page, delOrigen.texto.id).getByRole("button", { name: "Reenviar", exact: true }).isVisible())
  );
  ok(
    "la ubicación no ofrece «Reenviar»",
    (await filaDe(page, delOrigen.ubicacion.id).getByRole("button", { name: "Reenviar", exact: true }).count()) === 0
  );
  await filaDe(page, delOrigen.texto.id).getByRole("button", { name: "Reenviar", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Reenviar mensaje" });
  await dialogo.waitFor({ timeout: 5000 });
  ok("el diálogo enseña el texto", (await dialogo.locator("blockquote").innerText()).includes(TEXTO));
  ok("un texto no lleva pie", (await dialogo.locator("textarea").count()) === 0);
  ok("avisa que llega sin «Reenviado»", (await dialogo.getByText(/sin la marca «Reenviado»/).count()) === 1);
  ok(
    "la de ventana cerrada está apagada",
    await dialogo.getByRole("radio", { name: new RegExp(NOMBRES.cerrada) }).isDisabled()
  );
  await dialogo.getByRole("radio", { name: new RegExp(NOMBRES.destino) }).check();
  await page.screenshot({ path: `${SALIDA}/059-dialogo-texto-${TEMA}.png` });
  await dialogo.getByRole("button", { name: `Reenviar a ${NOMBRES.destino}` }).dblclick();
  ok("el hilo dice «Mensaje reenviado a…»", Boolean(await hasta(async () => (await page.getByText(`Mensaje reenviado a ${NOMBRES.destino}`).count()) === 1)));
  const copias = await hasta(async () => {
    const n = (await mensajes("destino")).filter((m) => m.text === TEXTO).length;
    return n > 0 ? n : null;
  });
  ok("el texto llegó al destino una sola vez (doble clic)", copias === 1, String(copias));
  ok("y salió a Graph como texto", (await outbox()).some((o) => o.body?.text?.body === TEXTO));
  await page.locator(`[data-message-id="${delOrigen.doc.id}"]`).scrollIntoViewIfNeeded();
  await filaDe(page, delOrigen.doc.id).hover();
  await filaDe(page, delOrigen.doc.id).getByRole("button", { name: "Reenviar", exact: true }).click();
  const dialogoDoc = page.getByRole("dialog", { name: "Reenviar documento" });
  ok("un documento abre «Reenviar documento» con su pie", (await dialogoDoc.locator("textarea").inputValue()) === `La cotización ${S}`);
  await page.screenshot({ path: `${SALIDA}/059-dialogo-documento-${TEMA}.png` });
  await dialogoDoc.getByRole("button", { name: "Cancelar" }).click();

  console.log("\n== AC6 · AC7 · en el celular ==");
  const movil = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    storageState: await ctx.storageState(),
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await movil.addCookies([{ name: "vocero-theme", value: TEMA, url: BASE }]);
  const cel = await movil.newPage();
  cel.on("pageerror", (e) => errores.push(e.message));
  const cdp = await movil.newCDPSession(cel);
  const toque = (type, x, y) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  async function centro(loc) {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  async function deslizar(loc, dx, dy = 0, { soltar = true } = {}) {
    const { x, y } = await centro(loc);
    await toque("touchStart", x, y);
    for (let i = 1; i <= 8; i++) {
      await toque("touchMove", x + (dx * i) / 8, y + (dy * i) / 8);
      await espera(16);
    }
    if (soltar) await toque("touchEnd");
  }
  async function mantener(loc) {
    const { x, y } = await centro(loc);
    await toque("touchStart", x, y);
    await espera(750);
    await toque("touchEnd");
  }

  await cel.goto(`${BASE}/inbox`);
  await cel.getByText(NOMBRES.origen).first().click();
  const burbuja = cel.locator(`[data-message-id="${delOrigen.texto.id}"]`);
  await burbuja.waitFor({ timeout: 20000 });
  ok("el celular emulado no tiene «pasar el ratón»", await cel.evaluate(() => matchMedia("(hover: none)").matches));
  ok(
    "no hay iconos junto a las burbujas",
    !(await filaDe(cel, delOrigen.texto.id).getByRole("button", { name: "Responder" }).isVisible())
  );
  const cita = cel.locator(`[data-replying-to="${delOrigen.texto.id}"]`);
  const quitarCita = async () => {
    if (await cita.count()) await cel.getByRole("button", { name: "Cancelar respuesta" }).click();
  };

  await deslizar(burbuja, -60, 0, { soltar: false });
  await cel.screenshot({ path: `${SALIDA}/059-deslizando-${TEMA}.png` });
  await toque("touchEnd");
  ok("deslizar a la izquierda cita el mensaje", await hasta(async () => (await cita.count()) === 1, 3000));
  await quitarCita();
  await deslizar(burbuja, 80);
  ok("deslizar a la derecha también", await hasta(async () => (await cita.count()) === 1, 3000));
  await quitarCita();
  await deslizar(burbuja, -30);
  await espera(300);
  ok("deslizar 30 px no cita", (await cita.count()) === 0);
  await deslizar(burbuja, 20, -90);
  await espera(300);
  ok("un arrastre vertical no cita", (await cita.count()) === 0);

  await mantener(burbuja);
  const menu = cel.getByRole("menu", { name: "Acciones del mensaje" });
  ok("mantener presionado abre el menú", await hasta(async () => menu.isVisible(), 3000));
  const items = await menu.getByRole("menuitem").allInnerTexts();
  ok("con Responder, Reenviar y Copiar texto", JSON.stringify(items.map((t) => t.trim())) === JSON.stringify(["Responder", "Reenviar", "Copiar texto"]), JSON.stringify(items));
  ok("mantener presionado no cita", (await cita.count()) === 0);
  const sinDesborde = () => cel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  ok("el menú no desborda a 390 px", await sinDesborde());
  await cel.screenshot({ path: `${SALIDA}/059-menu-${TEMA}.png` });
  await menu.getByRole("menuitem", { name: "Copiar texto" }).click();
  ok("«Copiar texto» lo copia", Boolean(await hasta(async () => (await cel.getByText("Texto copiado").count()) === 1, 3000)));
  ok("y es el texto del mensaje", (await cel.evaluate(() => navigator.clipboard.readText()).catch(() => "")) === TEXTO);

  await mantener(burbuja);
  await menu.getByRole("menuitem", { name: "Reenviar" }).click();
  const dialogoCel = cel.getByRole("dialog", { name: "Reenviar mensaje" });
  await dialogoCel.waitFor({ timeout: 5000 });
  const caja = await dialogoCel.boundingBox();
  ok("el diálogo cabe en 390 px", Boolean(caja && caja.x >= 0 && caja.x + caja.width <= 390), JSON.stringify(caja));
  ok("sin desplazamiento horizontal", await sinDesborde());
  await dialogoCel.getByRole("radio", { name: new RegExp(NOMBRES.destino) }).check();
  await dialogoCel.getByRole("button", { name: `Reenviar a ${NOMBRES.destino}` }).click();
  ok("«Reenviar» desde el menú sale", Boolean(await hasta(async () => (await cel.getByText(`Mensaje reenviado a ${NOMBRES.destino}`).count()) === 1)));

  await mantener(burbuja);
  await menu.getByRole("menuitem", { name: "Responder" }).click();
  ok("«Responder» desde el menú cita", await hasta(async () => (await cita.count()) === 1, 3000));
  await movil.close();
} finally {
  ok("sin errores de la página", errores.length === 0, errores.join(" | "));
  await browser.close();
}

console.log(`\n${checks - failures}/${checks} checks en verde`);
process.exit(failures > 0 ? 1 : 0);
