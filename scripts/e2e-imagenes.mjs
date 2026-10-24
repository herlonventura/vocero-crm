/**
 * Self-test E2E de comportamiento — pegar y reenviar imágenes (spec 042,
 * guion tests/e2e/us-imagenes.md).
 *
 * Conduce la UI real con Playwright contra wa-mock: pegar una imagen con el
 * portapapeles, los rechazos que no pisan nada, el fallo de red, el diálogo de
 * reenvío y las guardas de la ruta. Ningún mensaje sale a Meta.
 *
 * Uso: node --env-file=.env scripts/e2e-imagenes.mjs
 * Requiere: app corriendo con WA_MOCK_ENABLED=true y BD migrada.
 */
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const PN = "PN-IMG-1";
const S = Math.random().toString(36).slice(2, 6).toUpperCase();
// PNG de 1×1: lo que el portapapeles pone al copiar una imagen.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

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
const ctx = await browser.newContext({
  viewport: { width: 1500, height: 950 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const req = ctx.request;

console.log("== Setup: operador, conexión y conversaciones ==");
const email = process.env.E2E_EMAIL ?? "e2e@vocero.test";
const password = process.env.E2E_PASSWORD ?? "password-e2e-123";
let su = await req.post(`${BASE}/api/auth/sign-up/email`, {
  data: { email, password, name: "Operador E2E" },
});
if (!su.ok()) su = await req.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password } });
ok("registro o login del operador", su.ok());
const conn = await req.put(`${BASE}/api/settings/whatsapp`, {
  data: { wabaId: "WABA-IMG", phoneNumberId: PN, token: "tok-img" },
});
ok("conexión WhatsApp guardada", conn.ok());

const rnd = () => Math.floor(1000 + Math.random() * 8999);
const NOMBRES = {
  origen: `Origen${S}`,
  destino: `Destino${S}`,
  cerrada: `Cerrada${S}`,
};
const inbound = (name, data) =>
  req.post(`${BASE}/api/dev/wa-mock/inbound`, {
    data: { phoneNumberId: PN, from: `52155540${rnd()}`, name, ...data },
  });
await inbound(NOMBRES.origen, {
  type: "image",
  mediaId: `media-img-${S}`,
  mimeType: "image/jpeg",
  caption: `Así lo quiero ${S}`,
});
await inbound(NOMBRES.destino, { text: `Hola, soy el destino ${S}` });
await inbound(NOMBRES.cerrada, {
  text: `Hola de ayer ${S}`,
  timestamp: Math.floor(Date.now() / 1000) - 30 * 3600,
});

const convs = {};
await until(async () => {
  const d = await (await req.get(`${BASE}/api/conversations`)).json();
  for (const [k, name] of Object.entries(NOMBRES)) {
    convs[k] = (d.conversations ?? []).find((c) => c.contact.name === name) ?? null;
  }
  return Object.values(convs).every(Boolean);
});
ok("las tres conversaciones existen", Object.values(convs).every(Boolean));
if (!Object.values(convs).every(Boolean)) {
  await browser.close();
  process.exit(1);
}
const mensajes = async (k) =>
  (await (await req.get(`${BASE}/api/conversations/${convs[k].id}/messages`)).json()).messages ?? [];
let imagen = null;
await until(async () => {
  imagen = (await mensajes("origen")).find((m) => m.media?.kind === "image") ?? null;
  return Boolean(imagen);
});
// Como la bandeja al pintarla: si la descarga en segundo plano falló, se reintenta.
const bajada = imagen ? await req.get(`${BASE}/api/media/${imagen.media.assetId}`) : null;
ok("la imagen del origen está en el almacén", Boolean(bajada?.ok()));
const outbox = async () =>
  (await (await req.get(`${BASE}/api/dev/wa-mock/outbox`)).json()).outbox ?? [];
const enviadosA = (await outbox()).length;

console.log("\n== La ruta rechaza antes de mandar nada ==");
const reenviar = (r, conv, body) =>
  r.post(`${BASE}/api/conversations/${conv}/messages/forward-image`, { data: body });
const anon = await browser.newContext();
ok(
  "sin sesión → 401",
  (await reenviar(anon.request, convs.destino.id, { sourceMessageId: imagen.id })).status() === 401,
);
await anon.close();
ok(
  "destino que no es de la organización → 404",
  (await reenviar(req, "cv_no_existe", { sourceMessageId: imagen.id })).status() === 404,
);
ok(
  "origen que no existe → 404",
  (await reenviar(req, convs.destino.id, { sourceMessageId: "msg_no_existe" })).status() === 404,
);
ok(
  "una URL en el cuerpo → 422",
  (await reenviar(req, convs.destino.id, {
    sourceMessageId: imagen.id,
    url: "http://example.test/x.png",
  })).status() === 422,
);
ok(
  "ventana cerrada → 409",
  (await reenviar(req, convs.cerrada.id, { sourceMessageId: imagen.id })).status() === 409,
);
ok(
  "a la misma conversación → 422",
  (await reenviar(req, convs.origen.id, { sourceMessageId: imagen.id })).status() === 422,
);
// El destino sin adjuntos (Instagram, Messenger, TikTok → 422) lo cubre
// tests/unit/forward-image.test.ts: crear aquí esa conversación exige
// conectar Zernio y firmar su webhook.
ok("nada de eso llegó a Graph", (await outbox()).length === enviadosA);

const page = await ctx.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(e.message));
// Avisos de React en consola (p. ej. llaves repetidas entre hermanos).
page.on("console", (m) => {
  if (m.type() === "error" && /same key|Each child/.test(m.text())) errores.push(m.text().slice(0, 160));
});
await page.goto(`${BASE}/inbox`);
await page.getByText(NOMBRES.destino).first().click();
const box = page.getByPlaceholder("Escribe una respuesta");
await box.waitFor({ timeout: 20000 });
const pie = page.getByPlaceholder("Pie del adjunto (opcional)…");
const quitar = page.getByRole("button", { name: "Quitar adjunto" });

/** Pega con un ClipboardEvent sintético; `modo` decide qué trae. */
const pegar = (modo) =>
  page.getByPlaceholder(/Escribe una respuesta|Pie del adjunto/).evaluate(
    (el, { b64, modo }) => {
      const dt = new DataTransfer();
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      if (modo === "texto") dt.setData("text/plain", "texto pegado");
      else if (modo === "gif") dt.items.add(new File([bytes], "a.gif", { type: "image/gif" }));
      else if (modo === "grande")
        dt.items.add(new File([new Uint8Array(6 * 1024 * 1024)], "g.png", { type: "image/png" }));
      else if (modo === "dos") {
        dt.items.add(new File([bytes], "a.png", { type: "image/png" }));
        dt.items.add(new File([bytes], "b.png", { type: "image/png" }));
      } else dt.items.add(new File([bytes], `pegada-${modo}.png`, { type: "image/png" }));
      el.dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }),
      );
    },
    { b64: PNG_B64, modo },
  );

console.log("\n== Pegar una imagen ==");
// Portapapeles real primero: una imagen de verdad + Ctrl+V.
await page.evaluate(async (b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "image/png" });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}, PNG_B64);
await box.click();
await box.press("Control+V");
ok("Ctrl+V con una imagen la deja como adjunto", await until(async () => (await quitar.count()) === 1, 5000));
ok("con vista previa", (await page.locator('img[src^="blob:"]').count()) === 1);
await quitar.click();
ok("quitarla no manda nada", (await quitar.count()) === 0 && (await outbox()).length === enviadosA);

await box.fill("hola ");
await pegar("texto");
ok("pegar texto no adjunta nada", (await quitar.count()) === 0);
await box.fill("");

await pegar("uno");
await quitar.waitFor({ timeout: 5000 });
await pie.fill(`Pie pegado ${S}`);
await pegar("gif");
// `p[role=alert]`: Next tiene su propio anunciador de rutas con role=alert.
const alerta = page.locator('p[role="alert"]');
ok(
  "un GIF avisa y no pisa el adjunto ni el pie",
  (await alerta.innerText()).includes("JPEG, PNG o WebP") &&
    (await page.getByText("pegada-uno.png").count()) === 1 &&
    (await pie.inputValue()) === `Pie pegado ${S}`,
);
await pegar("grande");
ok("más de 5 MB avisa", (await alerta.innerText()).includes("5 MB"));
await pegar("dos");
ok("dos a la vez avisa", (await alerta.innerText()).includes("una imagen a la vez"));
ok("el adjunto sigue siendo el mismo", (await page.getByText("pegada-uno.png").count()) === 1);

// Fallo de red: el adjunto y el pie se quedan para reintentar.
await page.route("**/messages/media", (route) => route.abort("failed"));
await page.getByRole("button", { name: "Enviar", exact: true }).click();
ok(
  "si la red falla, se avisa",
  await until(async () => (await alerta.innerText().catch(() => "")).includes("No se pudo conectar"), 5000),
);
ok(
  "y el adjunto y el pie se quedan",
  (await quitar.count()) === 1 && (await pie.inputValue()) === `Pie pegado ${S}`,
);
await page.unroute("**/messages/media");
await page.getByRole("button", { name: "Enviar", exact: true }).click();
let pegado = null;
await until(async () => {
  pegado = (await mensajes("destino")).find((m) => m.media?.caption === `Pie pegado ${S}`) ?? null;
  return Boolean(pegado);
}, 15000);
ok("al reintentar, la imagen pegada sale al hilo", Boolean(pegado));
ok(
  "y a Graph, una sola vez",
  (await outbox()).filter((o) => o.body?.image?.caption === `Pie pegado ${S}`).length === 1,
);
ok("el compositor queda limpio", (await quitar.count()) === 0);

console.log("\n== Reenviar una imagen ==");
await page.getByText(NOMBRES.origen).first().click();
const burbuja = page.getByText(`Así lo quiero ${S}`).first();
await burbuja.waitFor({ timeout: 10000 });
// El botón de ESTA imagen: el hilo anterior también tenía una (la pegada).
// 059: es el icono «Reenviar» que aparece al pasar el ratón por la burbuja.
const filaDe = (p, id) => p.locator(`div.group:has([data-message-id="${id}"])`);
const boton = filaDe(page, imagen.id).getByRole("button", { name: "Reenviar", exact: true });
await filaDe(page, imagen.id).hover();
ok("la imagen trae «Reenviar»", (await boton.count()) === 1);
await boton.click();
const dialogo = page.getByRole("dialog", { name: "Reenviar imagen" });
await dialogo.waitFor({ timeout: 5000 });
ok("el diálogo enseña la imagen", (await dialogo.getByRole("img", { name: "Imagen para reenviar" }).count()) === 1);
const pieDialogo = dialogo.locator("textarea");
ok("con el pie del original", (await pieDialogo.inputValue()) === `Así lo quiero ${S}`);
ok(
  "el origen no es destino",
  (await dialogo.getByText(NOMBRES.origen, { exact: true }).count()) === 0,
);
const radioCerrada = dialogo.getByRole("radio", { name: new RegExp(NOMBRES.cerrada) });
ok("la de ventana cerrada está deshabilitada", await radioCerrada.isDisabled());
await dialogo.getByRole("textbox", { name: "Buscar destinatario" }).fill(NOMBRES.destino.slice(0, 7));
ok(
  "la búsqueda filtra",
  (await dialogo.getByRole("radio").count()) >= 1 &&
    (await dialogo.getByText(NOMBRES.cerrada, { exact: true }).count()) === 0,
);
await dialogo.getByRole("radio", { name: new RegExp(NOMBRES.destino) }).check();
const confirmar = dialogo.getByRole("button", { name: `Reenviar a ${NOMBRES.destino}` });
ok("el botón lleva el nombre del destino", (await confirmar.count()) === 1);
ok("elegir no envía", (await outbox()).length === enviadosA + 1);
await page.keyboard.press("Escape");
ok("Escape cierra sin enviar", (await dialogo.count()) === 0 && (await outbox()).length === enviadosA + 1);

await boton.first().click();
await dialogo.waitFor({ timeout: 5000 });
await dialogo.getByRole("button", { name: "Cancelar" }).click();
ok("Cancelar cierra sin enviar", (await dialogo.count()) === 0 && (await outbox()).length === enviadosA + 1);

await boton.first().click();
await dialogo.waitFor({ timeout: 5000 });
await dialogo.locator("textarea").fill(`Pie del reenvío ${S}`);
await dialogo.getByRole("radio", { name: new RegExp(NOMBRES.destino) }).check();
await dialogo.getByRole("button", { name: `Reenviar a ${NOMBRES.destino}` }).dblclick();
ok(
  "confirmar envía y avisa en el hilo",
  await until(async () => (await page.getByText(`Imagen reenviada a ${NOMBRES.destino}`).count()) === 1, 15000),
);
let copia = null;
await until(async () => {
  copia = (await mensajes("destino")).find((m) => m.media?.caption === `Pie del reenvío ${S}`) ?? null;
  return Boolean(copia);
}, 10000);
ok("la copia llega al destino con el pie editado", Boolean(copia) && copia.direction === "out");
ok(
  "a Graph salió una sola vez pese al doble clic",
  (await outbox()).filter((o) => o.body?.image?.caption === `Pie del reenvío ${S}`).length === 1,
);
ok("es un adjunto nuevo", copia?.media?.assetId !== imagen.media.assetId);
const original = (await mensajes("origen")).find((m) => m.id === imagen.id);
ok("el original no cambió", original?.media?.caption === `Así lo quiero ${S}`);

console.log("\n== En un teléfono ==");
const movil = await browser.newContext({
  viewport: { width: 390, height: 780 },
  storageState: await ctx.storageState(),
});
const tel = await movil.newPage();
tel.on("pageerror", (e) => errores.push(e.message));
await tel.goto(`${BASE}/inbox`);
await tel.getByText(NOMBRES.origen).first().click();
const burbujaTel = tel.getByText(`Así lo quiero ${S}`).first();
await burbujaTel.waitFor({ timeout: 10000 });
await filaDe(tel, imagen.id).hover();
await filaDe(tel, imagen.id).getByRole("button", { name: "Reenviar", exact: true }).click();
const dialogoTel = tel.getByRole("dialog", { name: "Reenviar imagen" });
await dialogoTel.waitFor({ timeout: 5000 });
const rd = await dialogoTel.boundingBox();
ok("el diálogo cabe en 390 px", Boolean(rd && rd.x >= 0 && rd.x + rd.width <= 390), JSON.stringify(rd));
ok(
  "sin desplazamiento horizontal",
  await tel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
);
await dialogoTel.getByRole("button", { name: "Cancelar" }).click();
await movil.close();
ok("sin errores de la página", errores.length === 0, errores.join(" | "));

await browser.close();
console.log(`\n${checks - failures}/${checks} comprobaciones en verde`);
process.exit(failures ? 1 : 0);
