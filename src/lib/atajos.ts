/**
 * 055 — Lo puro de los atajos de teclado: qué combinación es cuál, cuándo no
 * se toca lo que se escribe (D4) y a qué conversación se pasa (D3).
 */

type Tecla = {
  key: string;
  code?: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey?: boolean;
};

/** Para la ayuda (D2): qué hace cada atajo y dónde sirve. */
export const ATAJOS: { teclas: string[]; que: string; donde: "Cualquier pantalla" | "Bandeja" }[] = [
  { teclas: ["Ctrl", "K"], que: "Buscar una pantalla o una conversación", donde: "Cualquier pantalla" },
  { teclas: ["?"], que: "Ver estos atajos", donde: "Cualquier pantalla" },
  { teclas: ["Alt", "J"], que: "Siguiente conversación de la lista", donde: "Bandeja" },
  { teclas: ["Alt", "K"], que: "Conversación anterior", donde: "Bandeja" },
  { teclas: ["/"], que: "Ir al buscador de la Bandeja", donde: "Bandeja" },
  { teclas: ["Alt", "R"], que: "Escribir una respuesta", donde: "Bandeja" },
  { teclas: ["Alt", "N"], que: "Escribir una nota interna", donde: "Bandeja" },
];

/** D4 — Un campo donde se escribe: ahí «?» y «/» son letras, no atajos. */
export function esCampoDeTexto(t: EventTarget | null): boolean {
  if (!t || typeof (t as HTMLElement).tagName !== "string") return false;
  const el = t as HTMLElement;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
}

/** D1 — Ctrl+K, o ⌘K en Mac. Con Alt o Shift, no. */
export function esBarraDeComandos(e: Tecla): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k";
}

/** D2 — «?» sin Ctrl, ⌘ ni Alt (Shift sí: en muchos teclados «?» lo lleva). */
export function esAyuda(e: Tecla): boolean {
  return e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey;
}

export type AtajoBandeja = "siguiente" | "anterior" | "buscar" | "responder" | "nota";

/**
 * D3 — El atajo de la Bandeja de esta tecla, o null. Con Alt se mira la tecla
 * física (`code`): en Mac, Option+J escribe «∆».
 */
export function atajoBandeja(e: Tecla): AtajoBandeja | null {
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    switch (e.code) {
      case "KeyJ":
        return "siguiente";
      case "KeyK":
        return "anterior";
      case "KeyR":
        return "responder";
      case "KeyN":
        return "nota";
      default:
        return null;
    }
  }
  if (e.key === "/" && !e.altKey && !e.ctrlKey && !e.metaKey) return "buscar";
  return null;
}

/** Los atajos con Alt sirven también escribiendo; «/» solo fuera de un campo. */
export function sirveEscribiendo(a: AtajoBandeja): boolean {
  return a !== "buscar";
}

/**
 * D3 — La conversación vecina en el orden que se ve. Sin ninguna elegida,
 * Alt+J va a la primera y Alt+K a la última. En los extremos no da la vuelta:
 * quedarse quieto avisa que se acabó la lista.
 */
export function vecina(ids: readonly string[], actual: string | null, dir: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const i = actual ? ids.indexOf(actual) : -1;
  if (i === -1) return dir === 1 ? ids[0]! : ids[ids.length - 1]!;
  const j = i + dir;
  return j < 0 || j >= ids.length ? null : ids[j]!;
}
