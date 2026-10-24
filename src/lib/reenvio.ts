/**
 * 059 — Qué mensaje se puede reenviar y cómo (D1), y el gesto de deslizar
 * para responder en el celular (D6). Puro: lo usan el hilo y el servidor.
 */

/** Adjuntos que salen como un archivo nuevo. El sticker sale como imagen. */
const ADJUNTOS_REENVIABLES = new Set(["image", "sticker", "video", "audio", "document"]);

/** Tipos que nunca se reenvían aunque traigan texto. */
const TIPOS_SIN_REENVIO = new Set(["reaction", "unsupported", "location", "contacts"]);

export type ClaseReenvio = "texto" | "adjunto";

/**
 * `adjunto` si el mensaje trae un archivo que se puede volver a mandar,
 * `texto` si trae texto, o null si no se reenvía (ubicación, contacto,
 * reacción…).
 */
export function claseReenvio(m: {
  type: string;
  text: string | null;
  media: { kind: string } | null;
}): ClaseReenvio | null {
  if (m.media) return ADJUNTOS_REENVIABLES.has(m.media.kind) ? "adjunto" : null;
  if (TIPOS_SIN_REENVIO.has(m.type)) return null;
  return m.text && m.text.trim() ? "texto" : null;
}

/** Cómo se nombra lo que se reenvía: «Reenviar imagen», «Imagen reenviada…». */
export function nombreReenvio(m: { media: { kind: string } | null }): {
  titulo: string;
  hecho: string;
} {
  switch (m.media?.kind) {
    case "image":
    case "sticker":
      return { titulo: "Reenviar imagen", hecho: "Imagen reenviada" };
    case "video":
      return { titulo: "Reenviar video", hecho: "Video reenviado" };
    case "audio":
      return { titulo: "Reenviar audio", hecho: "Audio reenviado" };
    case "document":
      return { titulo: "Reenviar documento", hecho: "Documento reenviado" };
    default:
      return { titulo: "Reenviar mensaje", hecho: "Mensaje reenviado" };
  }
}

/** Solo estos adjuntos llevan pie (la Cloud API no lo admite en el audio). */
export function llevaPie(m: { media: { kind: string } | null }): boolean {
  return m.media?.kind === "image" || m.media?.kind === "video" || m.media?.kind === "document";
}

/** A partir de aquí, soltar la burbuja la cita. */
export const DESLIZAR_PARA_CITAR_PX = 56;
/** Hasta dónde sigue la burbuja al dedo. */
export const DESLIZAR_MAX_PX = 72;
/** Lo que hay que mantener presionado para abrir el menú. */
export const PULSACION_LARGA_MS = 500;
/** Moverse más que esto cancela la pulsación larga. */
export const TOLERANCIA_PULSACION_PX = 10;

/**
 * Cuánto se corre la burbuja con el dedo en (dx, dy): 0 mientras el
 * movimiento sea más vertical que horizontal (es desplazar el hilo), y nunca
 * más de `DESLIZAR_MAX_PX` hacia ningún lado.
 */
export function desplazamientoBurbuja(dx: number, dy: number): number {
  if (Math.abs(dx) <= Math.abs(dy)) return 0;
  return Math.max(-DESLIZAR_MAX_PX, Math.min(DESLIZAR_MAX_PX, dx));
}

/** Soltar con este desplazamiento cita el mensaje (hacia cualquier lado). */
export function sueltaYCita(desplazamiento: number): boolean {
  return Math.abs(desplazamiento) >= DESLIZAR_PARA_CITAR_PX;
}
