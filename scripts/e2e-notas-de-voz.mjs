/**
 * Self-test E2E de comportamiento — notas de voz (spec 044, guion
 * tests/e2e/us-notas-de-voz.md).
 *
 * Conduce la UI real con Playwright contra wa-mock. El micrófono es el falso
 * de Chromium (un tono), así que se graba de verdad con `MediaRecorder`: lo
 * que llega al wa-mock es lo que llegaría a Meta. Ningún mensaje sale a Meta.
 *
 * Uso: node --env-file=.env scripts/e2e-notas-de-voz.mjs
 * Requiere: app corriendo con WA_MOCK_ENABLED=true y BD migrada.
 */
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const PN = "PN-VOZ-1";
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

const MIC = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];
const browser = await chromium.launch({ args: MIC });
const ctx = await browser.newContext({
  viewport: { width: 1500, height: 950 },
  permissions: ["microphone"],
});
const req = ctx.request;

console.log("== Setup: operador, conexión y una conversación con una nota de voz ==");
const email = process.env.E2E_EMAIL ?? "e2e@vocero.test";
const password = process.env.E2E_PASSWORD ?? "password-e2e-123";
let su = await req.post(`${BASE}/api/auth/sign-up/email`, {
  data: { email, password, name: "Operador E2E" },
});
if (!su.ok()) su = await req.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password } });
ok("registro o login del operador", su.ok());
const conn = await req.put(`${BASE}/api/settings/whatsapp`, {
  data: { wabaId: "WABA-VOZ", phoneNumberId: PN, token: "tok-voz" },
});
ok("conexión WhatsApp guardada", conn.ok());

const NAME = `Voz${S}`;
const FROM = `52155552${Math.floor(1000 + Math.random() * 8999)}`;
await req.post(`${BASE}/api/dev/wa-mock/inbound`, {
  data: { phoneNumberId: PN, from: FROM, name: NAME, text: `Hola ${S}` },
});
await req.post(`${BASE}/api/dev/wa-mock/inbound`, {
  data: {
    phoneNumberId: PN,
    from: FROM,
    name: NAME,
    type: "audio",
    mediaId: `media-audio-${S}`,
    mimeType: "audio/ogg; codecs=opus",
  },
});
let conv = null;
await until(async () => {
  const d = await (await req.get(`${BASE}/api/conversations`)).json();
  conv = (d.conversations ?? []).find((c) => c.contact.name === NAME) ?? null;
  return Boolean(conv);
});
ok("la conversación existe", Boolean(conv));
if (!conv) {
  await browser.close();
  process.exit(1);
}
const mock = async () => await (await req.get(`${BASE}/api/dev/wa-mock/outbox`)).json();
const mensajes = async () =>
  (await (await req.get(`${BASE}/api/conversations/${conv.id}/messages`)).json()).messages ?? [];
ok(
  "la nota de voz entrante quedó copiada",
  // Con la app recién levantada, compilar las rutas del mock tarda.
  await until(
    async () =>
      (await mensajes()).some((m) => m.media?.kind === "audio" && m.media.fetchStatus === "available"),
    60000
  )
);

const page = await ctx.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(e.message));
await page.goto(`${BASE}/inbox`);
await page.getByText(NAME).first().click();
const box = page.getByPlaceholder("Escribe una respuesta");
await box.waitFor({ timeout: 20000 });
const hilo = page.getByRole("region", { name: "Chat: adjuntar imagen" });
const reproductores = hilo.locator("[data-audio-player]");

console.log("\n== El reproductor (nota entrante) ==");
const entrante = reproductores.first();
await entrante.waitFor({ timeout: 15000 });
const tiempo = entrante.locator("span.font-mono");
ok(
  "enseña la duración de la nota (0:03)",
  await until(async () => (await tiempo.textContent()) === "0:03", 10000),
  await tiempo.textContent()
);
ok("trae la onda (40 barras)", (await entrante.locator('[role="slider"] > span:not([aria-hidden])').count()) === 40);

const velocidad = entrante.getByRole("button", { name: /^Velocidad/ });
ok("la velocidad empieza en 1×", (await velocidad.textContent()) === "1×");
await velocidad.click();
ok("un clic la pasa a 1.5×", (await velocidad.textContent()) === "1.5×");
await velocidad.click();
ok("otro, a 2×", (await velocidad.textContent()) === "2×");

await entrante.getByRole("button", { name: "Reproducir audio" }).click();
ok(
  "reproducir cambia el botón a pausar",
  await until(async () => (await entrante.getAttribute("data-playing")) === "true", 5000)
);
const slider = entrante.getByRole("slider", { name: "Posición del audio" });
ok(
  "a 2× avanza (el tiempo corre)",
  await until(async () => Number(await slider.getAttribute("aria-valuenow")) >= 1, 4000)
);
await entrante.getByRole("button", { name: "Pausar audio" }).click();
ok(
  "pausar lo detiene",
  await until(async () => (await entrante.getAttribute("data-playing")) === "false", 3000)
);

// Ir a un momento: clic al 80 % de la onda.
const caja = await slider.boundingBox();
await page.mouse.click(caja.x + caja.width * 0.8, caja.y + caja.height / 2);
ok(
  "tocar la onda lleva a ese momento (0:02 de 0:03)",
  await until(async () => (await slider.getAttribute("aria-valuetext"))?.startsWith("0:02"), 3000),
  await slider.getAttribute("aria-valuetext")
);
// Arrastrar hacia el inicio.
await page.mouse.move(caja.x + caja.width * 0.7, caja.y + caja.height / 2);
await page.mouse.down();
await page.mouse.move(caja.x + 2, caja.y + caja.height / 2, { steps: 5 });
await page.mouse.up();
ok(
  "arrastrar sobre la onda también mueve la posición (al inicio)",
  await until(async () => (await slider.getAttribute("aria-valuetext"))?.startsWith("0:00"), 3000),
  await slider.getAttribute("aria-valuetext")
);
await slider.focus();
await page.keyboard.press("End");
ok(
  "con el teclado, Fin lleva al final",
  (await slider.getAttribute("aria-valuenow")) === (await slider.getAttribute("aria-valuemax")),
  await slider.getAttribute("aria-valuetext")
);
await page.keyboard.press("ArrowLeft");
ok(
  "y la flecha izquierda retrocede",
  (await slider.getAttribute("aria-valuetext"))?.startsWith("0:00"),
  await slider.getAttribute("aria-valuetext")
);

console.log("\n== El botón de grabar ==");
const grabar = page.getByRole("button", { name: "Grabar nota de voz" });
ok("con la caja vacía, el botón es el micrófono", await grabar.isVisible());
await box.fill("hola");
ok(
  "al escribir vuelve a ser Enviar",
  (await page.getByRole("button", { name: "Enviar", exact: true }).isVisible()) &&
    !(await grabar.isVisible())
);
await box.fill("");

const recorder = page.locator("[data-voice-recorder]");
const notasSalientes = async () => (await mock()).outbox.filter((o) => o.type === "audio");

console.log("\n== Grabar, escuchar y enviar ==");
await grabar.click();
ok(
  "empieza a grabar (punto rojo y reloj)",
  await until(async () => (await recorder.getAttribute("data-voice-recorder")) === "grabando", 8000)
);
await sleep(2600);
ok("el reloj avanza", ((await recorder.getByRole("status").textContent()) ?? "").includes("0:02"));
await page.getByRole("button", { name: "Detener y escuchar" }).click();
ok(
  "detener deja la nota para escucharla antes de enviar",
  await until(async () => (await recorder.getAttribute("data-voice-recorder")) === "lista", 5000)
);
const vista = recorder.locator("[data-audio-player]");
ok(
  "la vista previa tiene la duración de lo grabado (~2.6 s)",
  await until(async () => /^0:0[23]$/.test((await vista.locator("span.font-mono").textContent()) ?? ""), 8000),
  await vista.locator("span.font-mono").textContent()
);

// Camino infeliz: el envío falla y la nota no se pierde.
await page.route("**/messages/media", (route) =>
  route.fulfill({
    status: 502,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "upload_failed", message: "No se pudo subir el adjunto a WhatsApp" } }),
  })
);
const antes = (await notasSalientes()).length;
await page.getByRole("button", { name: "Enviar nota de voz" }).click();
ok(
  "si el envío falla, se dice y la nota sigue ahí",
  await until(
    async () =>
      (await recorder.getByText("No se pudo subir el adjunto a WhatsApp").isVisible()) &&
      (await recorder.getAttribute("data-voice-recorder")) === "lista",
    6000
  )
);
await page.unroute("**/messages/media");
await page.getByRole("button", { name: "Enviar nota de voz" }).click();
ok(
  "reintentar la envía",
  await until(async () => (await notasSalientes()).length === antes + 1, 10000)
);
const enviada = (await notasSalientes()).at(-1);
ok("sale a Meta como nota de voz (voice: true)", enviada?.body?.audio?.voice === true, JSON.stringify(enviada?.body?.audio));
const subida = (await mock()).uploads.at(-1);
ok(
  "lo subido es Ogg/Opus (Chrome grabó WebM y el CRM lo convirtió)",
  subida?.type === "audio/ogg; codecs=opus" && subida?.head === "4f676753",
  JSON.stringify(subida)
);
ok("con nombre .ogg", subida?.fileName?.endsWith(".ogg"), subida?.fileName);
ok(
  "la grabadora se cierra y vuelve la caja",
  await until(async () => (await recorder.count()) === 0 && (await box.isVisible()), 5000)
);
ok(
  "la nota aparece en el hilo con su reproductor",
  await until(async () => (await reproductores.count()) === 2, 10000)
);
const saliente = reproductores.nth(1);
ok(
  "la nota enviada se puede oír: trae su duración",
  await until(async () => /^0:0[23]$/.test((await saliente.locator("span.font-mono").textContent()) ?? ""), 10000),
  await saliente.locator("span.font-mono").textContent()
);
const alturas = await saliente
  .locator('[role="slider"] > span:not([aria-hidden])')
  .evaluateAll((els) => els.map((e) => e.style.height));
ok("su onda sale del audio (no todas las barras iguales)", new Set(alturas).size > 1, alturas.slice(0, 6).join(","));
const guardado = (await mensajes()).filter((m) => m.media?.kind === "audio").at(-1);
ok("queda guardada como Ogg", guardado?.media?.mimeType?.startsWith("audio/ogg"), guardado?.media?.mimeType);

console.log("\n== Enviar sin detener, y descartar ==");
await grabar.click();
await until(async () => (await recorder.getAttribute("data-voice-recorder")) === "grabando", 8000);
await sleep(1500);
const antes2 = (await notasSalientes()).length;
await page.getByRole("button", { name: "Enviar nota de voz" }).click();
ok(
  "enviar mientras graba la detiene y la manda",
  await until(async () => (await notasSalientes()).length === antes2 + 1, 10000)
);
ok("también como nota de voz", (await notasSalientes()).at(-1)?.body?.audio?.voice === true);
await until(async () => (await recorder.count()) === 0, 5000);

await grabar.click();
await until(async () => (await recorder.getAttribute("data-voice-recorder")) === "grabando", 8000);
await sleep(800);
const antes3 = (await notasSalientes()).length;
await page.getByRole("button", { name: "Descartar nota de voz" }).click();
ok("descartar cierra la grabadora", await until(async () => (await recorder.count()) === 0, 3000));
await sleep(1500);
ok("y no manda nada", (await notasSalientes()).length === antes3);

console.log("\n== Un audio que llega con la conversación abierta ==");
const yaHabia = await reproductores.count();
await req.post(`${BASE}/api/dev/wa-mock/inbound`, {
  data: {
    phoneNumberId: PN,
    from: FROM,
    name: NAME,
    type: "audio",
    mediaId: `media-audio-vivo-${S}`,
    mimeType: "audio/ogg; codecs=opus",
  },
});
ok(
  "pasa de «descargando…» al reproductor sin recargar",
  await until(
    async () =>
      (await reproductores.count()) === yaHabia + 1 &&
      (await hilo.getByText("descargando…").count()) === 0,
    15000
  ),
  `reproductores=${await reproductores.count()} descargando=${await hilo.getByText("descargando…").count()}`
);

console.log("\n== La velocidad elegida se recuerda ==");
await page.reload();
await page.getByText(NAME).first().click();
await reproductores.first().waitFor({ timeout: 15000 });
ok(
  "al volver, los audios arrancan a 2×",
  (await reproductores.first().getByRole("button", { name: /^Velocidad/ }).textContent()) === "2×"
);

console.log("\n== Sin permiso de micrófono ==");
// El navegador dice que no: getUserMedia rechaza como cuando el operador
// bloquea el micrófono.
const sinMic = await chromium.launch();
const ctx2 = await sinMic.newContext({ viewport: { width: 1300, height: 900 } });
await ctx2.addInitScript(() => {
  navigator.mediaDevices.getUserMedia = () =>
    Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
});
await ctx2.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password } });
const p2 = await ctx2.newPage();
await p2.goto(`${BASE}/inbox`);
await p2.getByText(NAME).first().click();
await p2.getByPlaceholder("Escribe una respuesta").waitFor({ timeout: 20000 });
await p2.getByRole("button", { name: "Grabar nota de voz" }).click();
ok(
  "pide permitir el micrófono, sin colgarse",
  await p2
    .getByText("Permite el micrófono en el navegador para grabar notas de voz.")
    .waitFor({ timeout: 8000 })
    .then(() => true, () => false)
);
ok("y la caja sigue usable", await p2.getByPlaceholder("Escribe una respuesta").isVisible());
await sinMic.close();

ok("sin errores de página", errores.length === 0, errores.join(" | "));

await browser.close();
console.log(`\n${checks - failures}/${checks} verificaciones en verde`);
process.exit(failures ? 1 : 0);
