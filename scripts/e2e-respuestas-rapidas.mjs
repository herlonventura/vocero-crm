/**
 * Self-test E2E — 049: respuestas rápidas con «/».
 * Guion: tests/e2e/us-respuestas-rapidas.md.
 *
 * Requiere la app viva con WA_MOCK_ENABLED=true y META_GRAPH_BASE_URL →
 * wa-mock. `E2E_EMAIL` / `E2E_PASSWORD` para entrar con una cuenta que ya
 * exista (si no, se crea la suya).
 *
 * Uso: node --env-file=<env> scripts/e2e-respuestas-rapidas.mjs
 * Sale con 1 si algún check falla. Las capturas van a .tmp/.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "e2e-rapidas@vocero.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "password-e2e-rapidas";
const S = Date.now().toString(36);
const PN = `PN-QR-${S}`;

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
async function hasta(fn, ms = 20000) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > fin) return v;
    await espera(250);
  }
}

mkdirSync(".tmp", { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const req = ctx.request;
const api = (p, init = {}) => req.fetch(`${BASE}${p}`, { ...init, headers: { origin: BASE, ...(init.headers ?? {}) } });

try {
  console.log("== Preparación ==");
  let r = await api("/api/auth/sign-up/email", { method: "POST", data: { email: EMAIL, password: PASSWORD, name: "Dueña" } });
  if (!r.ok()) r = await api("/api/auth/sign-in/email", { method: "POST", data: { email: EMAIL, password: PASSWORD } });
  ok("login", r.ok());
  await api("/api/settings/whatsapp", { method: "PUT", data: { wabaId: "WABA-QR", phoneNumberId: PN, token: "tok-qr" } });

  // AC7 va primero: la demo solo se carga sobre una base sin datos, y el
  // guion crea conversaciones después.
  console.log("\n== AC7 · la demo ==");
  r = await api("/api/seed/demo", { method: "POST" });
  if (r.status() === 409) {
    console.log("  ·  la demo no se carga sobre una base con datos (409): se salta AC7");
  } else {
    const trasDemo = (await (await api("/api/quick-replies")).json()).respuestas ?? [];
    ok("la demo deja hola, horario, envio y pago", JSON.stringify(trasDemo.map((q) => q.atajo)) === JSON.stringify(["envio", "hola", "horario", "pago"]), JSON.stringify(trasDemo.map((q) => q.atajo)));
    const hola = trasDemo.find((q) => q.atajo === "hola");
    ok("la de saludo trae {nombre}", /\{nombre\}/.test(hola?.texto ?? ""), hola?.texto);
  }

  // Lo que hubiera de corridas anteriores, fuera: el guion parte de cero.
  for (const q of (await (await api("/api/quick-replies")).json()).respuestas ?? []) {
    await api(`/api/quick-replies/${q.id}`, { method: "DELETE" });
  }

  console.log("\n== AC4 · Ajustes por API ==");
  r = await api("/api/quick-replies", { method: "POST", data: { atajo: "/Horario", texto: "Abrimos de lunes a sábado de 8:00 a 19:00." } });
  const horario = (await r.json()).respuesta;
  ok("crear → 201, con el atajo normalizado", r.status() === 201 && horario?.atajo === "horario", JSON.stringify(horario));
  r = await api("/api/quick-replies", { method: "POST", data: { atajo: "Pago", texto: "Aceptamos transferencia y tarjeta." } });
  ok("otra → 201", r.status() === 201);
  r = await api("/api/quick-replies", { method: "POST", data: { atajo: "Envío", texto: "¡Hola {nombre}! Enviamos el mismo día." } });
  const envio = (await r.json()).respuesta;
  ok("«Envío» se guarda como «envio»", envio?.atajo === "envio", JSON.stringify(envio));
  r = await api("/api/quick-replies", { method: "POST", data: { atajo: "horario", texto: "otro" } });
  ok("atajo repetido → 409 duplicado", r.status() === 409 && (await r.json()).error?.code === "duplicado");
  r = await api("/api/quick-replies", { method: "POST", data: { atajo: "¡¡!!", texto: "x" } });
  ok("atajo inválido → 422", r.status() === 422);
  r = await api("/api/quick-replies", { method: "POST", data: { atajo: "vacio", texto: "   " } });
  ok("texto vacío → 422", r.status() === 422);
  r = await api(`/api/quick-replies/${envio.id}`, { method: "PATCH", data: { atajo: "envio", texto: "¡Hola {nombre}! Enviamos el mismo día si pides antes de las 14:00." } });
  ok("editar → 200", r.status() === 200 && /14:00/.test((await r.json()).respuesta?.texto ?? ""));

  console.log("\n== El compositor ==");
  const NOMBRE = `María Fernanda ${S}`;
  await api("/api/dev/wa-mock/inbound", {
    method: "POST",
    data: { phoneNumberId: PN, from: `52155540${Math.floor(1000 + Math.random() * 8999)}`, name: NOMBRE, text: `Hola ${S}` },
  });
  ok("la conversación existe", Boolean(await hasta(async () => ((await (await api("/api/conversations")).json()).conversations ?? []).find((c) => c.contact.name === NOMBRE))));
  const outbox = async () => ((await (await api("/api/dev/wa-mock/outbox")).json()).outbox ?? []).length;
  const enviadosAntes = await outbox();

  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.goto(`${BASE}/inbox`);
  await page.getByText(NOMBRE).first().click();
  const caja = page.getByPlaceholder("Escribe una respuesta");
  await caja.waitFor();
  const menu = page.getByTestId("menu-respuestas-rapidas");
  const opciones = menu.getByRole("option");

  // AC1
  await caja.click();
  await caja.pressSequentially("/");
  await menu.waitFor({ timeout: 10000 }).catch(() => {});
  ok("AC1 · «/» abre el menú con las tres", (await opciones.count()) === 3, String(await opciones.count()));
  await caja.pressSequentially("hor");
  ok("AC1 · «/hor» deja solo «horario»", (await opciones.count()) === 1 && /\/horario/.test(await opciones.first().innerText()));
  await page.screenshot({ path: ".tmp/e2e-049-menu.png" });
  await caja.press("Escape");
  ok("AC1 · Escape lo cierra sin tocar el texto", (await menu.count()) === 0 && (await caja.inputValue()) === "/hor");

  // AC2 con el teclado
  await caja.fill("");
  await caja.pressSequentially("/env");
  await menu.waitFor();
  await caja.press("Enter");
  const conNombre = await caja.inputValue();
  ok("AC2 · Enter elige: «{nombre}» sale con el primer nombre", conNombre === "¡Hola María! Enviamos el mismo día si pides antes de las 14:00.", conNombre);
  ok("AC2 · el menú se cierra", (await menu.count()) === 0);
  await espera(800);
  ok("AC2 · no se envía solo", (await outbox()) === enviadosAntes);

  // AC2 con ↓ y Tab
  await caja.fill("");
  await caja.pressSequentially("/");
  await menu.waitFor();
  await caja.press("ArrowDown");
  ok("↓ mueve la fila resaltada", (await menu.getByRole("option", { selected: true }).innerText()).includes("/horario"));
  await caja.press("Tab");
  ok("Tab elige", (await caja.inputValue()) === "Abrimos de lunes a sábado de 8:00 a 19:00.");

  // AC3 — en medio del texto, y barras que no abren nada
  await caja.fill("");
  await caja.pressSequentially("Gracias /pa");
  await menu.waitFor();
  await opciones.first().click();
  ok("AC3 · «Gracias /pa» → «Gracias » + la respuesta, con un clic", (await caja.inputValue()) === "Gracias Aceptamos transferencia y tarjeta.", await caja.inputValue());
  await caja.fill("");
  await caja.pressSequentially("son 3/4 de kilo");
  ok("AC3 · «3/4» no abre el menú", (await menu.count()) === 0);
  await caja.fill("");
  await caja.pressSequentially("mira https://tienda.mx");
  ok("AC3 · una URL no abre el menú", (await menu.count()) === 0);

  // Enter sin menú sigue enviando
  await caja.fill(`mensaje normal ${S}`);
  await caja.press("Enter");
  ok("Enter sin menú envía como siempre", Boolean(await hasta(async () => (await outbox()) === enviadosAntes + 1, 10000)));

  // AC8 — celular
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByText(NOMBRE).first().click().catch(() => {});
  await caja.waitFor();
  await caja.click();
  await caja.pressSequentially("/");
  await menu.waitFor();
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  const caja390 = await menu.boundingBox();
  ok("AC8 · a 390 px el menú cabe sin desplazamiento horizontal", !desborde && caja390 && caja390.x >= 0 && caja390.x + caja390.width <= 390, JSON.stringify(caja390));
  await page.screenshot({ path: ".tmp/e2e-049-menu-390.png" });
  await opciones.nth(1).tap().catch(async () => opciones.nth(1).click());
  ok("AC8 · se elige tocando", (await caja.inputValue()) === "Abrimos de lunes a sábado de 8:00 a 19:00.", await caja.inputValue());
  await page.setViewportSize({ width: 1280, height: 860 });

  console.log("\n== AC4 · un miembro sin permiso ==");
  const mEmail = `miembro-qr-${S}@vocero.test`;
  r = await api("/api/settings/team", { method: "POST", data: { name: "Vendedor", email: mEmail, password: "password-miembro-qr" } });
  ok("alta del miembro", r.status() === 201);
  const ctxM = await browser.newContext();
  const apiM = (p, init = {}) => ctxM.request.fetch(`${BASE}${p}`, { ...init, headers: { origin: BASE, ...(init.headers ?? {}) } });
  await apiM("/api/auth/sign-in/email", { method: "POST", data: { email: mEmail, password: "password-miembro-qr" } });
  const listaM = await apiM("/api/quick-replies");
  const jm = await listaM.json();
  ok("el miembro sí las lista (y las usa)", listaM.status() === 200 && jm.respuestas?.length === 3 && jm.puedeEditar === false, JSON.stringify(jm).slice(0, 120));
  ok("crear → 403", (await apiM("/api/quick-replies", { method: "POST", data: { atajo: "x", texto: "y" } })).status() === 403);
  ok("editar → 403", (await apiM(`/api/quick-replies/${horario.id}`, { method: "PATCH", data: { atajo: "x", texto: "y" } })).status() === 403);
  ok("borrar → 403", (await apiM(`/api/quick-replies/${horario.id}`, { method: "DELETE" })).status() === 403);
  await ctxM.close();

  console.log("\n== Ajustes → Respuestas rápidas (interfaz) ==");
  await page.goto(`${BASE}/settings/quick-replies`);
  // En las filas: la descripción de la tarjeta también menciona «/horario».
  const filas = page.locator("li").filter({ hasText: /^\/(horario|pago|envio)/ });
  await filas.first().waitFor({ timeout: 30000 });
  ok("la pantalla lista las tres", (await filas.count()) === 3, String(await filas.count()));
  await page.getByRole("button", { name: "Nueva respuesta" }).click();
  await page.getByLabel("Atajo").fill("Dirección");
  ok("enseña cómo queda el atajo", (await page.getByTestId("form-respuesta").innerText()).includes("/direccion"));
  await page.getByLabel("Texto").fill("Estamos en Av. Juárez 123, Centro.");
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.getByText("/direccion").waitFor({ timeout: 10000 }).catch(() => {});
  ok("crear desde la interfaz", (await page.getByText("/direccion").count()) === 1);
  await page.screenshot({ path: ".tmp/e2e-049-ajustes.png", fullPage: true });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Borrar /direccion" }).click();
  await page.getByText("/direccion").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
  ok("borrar desde la interfaz", (await page.getByText("/direccion").count()) === 0);

  console.log("\n== AC6 · sin respuestas ==");
  for (const q of (await (await api("/api/quick-replies")).json()).respuestas ?? []) {
    await api(`/api/quick-replies/${q.id}`, { method: "DELETE" });
  }
  await page.goto(`${BASE}/inbox`);
  await page.getByText(NOMBRE).first().click();
  await caja.waitFor();
  // 051 guarda el borrador de esta conversación: lo que quedó de un paso
  // anterior haría que la «/» caiga pegada al final, donde no abre el menú.
  await caja.fill("");
  await caja.click();
  await caja.pressSequentially("/");
  await menu.waitFor();
  const vacio = await menu.innerText();
  ok("el menú dice «Aún no hay respuestas rápidas»", /Aún no hay respuestas rápidas/.test(vacio), vacio);
  ok("y a quien configura le ofrece Ajustes", /Crearlas en Ajustes/.test(vacio));

  ok("sin errores de JavaScript en la página", errores.length === 0, errores.join(" | "));
} finally {
  await browser.close();
}

console.log(`\n${checks - failures}/${checks} checks en verde`);
process.exit(failures > 0 ? 1 : 0);
