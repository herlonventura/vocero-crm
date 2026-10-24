import { describe, expect, it } from "vitest";
import {
  ATAJOS,
  atajoBandeja,
  esAyuda,
  esBarraDeComandos,
  esCampoDeTexto,
  sirveEscribiendo,
  vecina,
} from "@/lib/atajos";

/** 055 — Qué combinación es cuál, cuándo no se toca lo que se escribe y el orden. */
const tecla = (p: Partial<{ key: string; code: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }>) => ({
  key: "",
  code: "",
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...p,
});

describe("055 — combinaciones", () => {
  it("Ctrl+K y ⌘K abren la barra; con Alt o Shift, no", () => {
    expect(esBarraDeComandos(tecla({ key: "k", ctrlKey: true }))).toBe(true);
    expect(esBarraDeComandos(tecla({ key: "K", metaKey: true }))).toBe(true);
    expect(esBarraDeComandos(tecla({ key: "k", ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(esBarraDeComandos(tecla({ key: "k", ctrlKey: true, altKey: true }))).toBe(false);
    expect(esBarraDeComandos(tecla({ key: "k" }))).toBe(false);
  });

  it("«?» abre la ayuda aunque lleve Shift, no con Ctrl", () => {
    expect(esAyuda(tecla({ key: "?", shiftKey: true }))).toBe(true);
    expect(esAyuda(tecla({ key: "?", ctrlKey: true }))).toBe(false);
  });

  it("los de la Bandeja miran la tecla física con Alt (Option+J en Mac escribe «∆»)", () => {
    expect(atajoBandeja(tecla({ key: "∆", code: "KeyJ", altKey: true }))).toBe("siguiente");
    expect(atajoBandeja(tecla({ key: "k", code: "KeyK", altKey: true }))).toBe("anterior");
    expect(atajoBandeja(tecla({ key: "r", code: "KeyR", altKey: true }))).toBe("responder");
    expect(atajoBandeja(tecla({ key: "n", code: "KeyN", altKey: true }))).toBe("nota");
    expect(atajoBandeja(tecla({ key: "/", code: "Slash" }))).toBe("buscar");
    expect(atajoBandeja(tecla({ key: "j", code: "KeyJ" }))).toBeNull();
    expect(atajoBandeja(tecla({ key: "j", code: "KeyJ", altKey: true, ctrlKey: true }))).toBeNull();
  });

  it("los de Alt sirven escribiendo; «/» no (en el compositor abre las respuestas rápidas)", () => {
    expect(sirveEscribiendo("siguiente")).toBe(true);
    expect(sirveEscribiendo("nota")).toBe(true);
    expect(sirveEscribiendo("buscar")).toBe(false);
  });

  it("la ayuda lista cada atajo que existe", () => {
    expect(ATAJOS.map((a) => a.teclas.join("+"))).toEqual(["Ctrl+K", "?", "Alt+J", "Alt+K", "/", "Alt+R", "Alt+N"]);
  });
});

describe("055 — campos de texto", () => {
  it("input, textarea, select y contenteditable son campos; un botón no", () => {
    expect(esCampoDeTexto({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(esCampoDeTexto({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(esCampoDeTexto({ tagName: "SELECT" } as unknown as EventTarget)).toBe(true);
    expect(esCampoDeTexto({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(esCampoDeTexto({ tagName: "BUTTON", isContentEditable: false } as unknown as EventTarget)).toBe(false);
    expect(esCampoDeTexto(null)).toBe(false);
  });
});

describe("055 — la conversación vecina", () => {
  const ids = ["a", "b", "c"];
  it("avanza y retrocede en el orden que se ve", () => {
    expect(vecina(ids, "a", 1)).toBe("b");
    expect(vecina(ids, "c", -1)).toBe("b");
  });
  it("sin ninguna elegida, a la primera o a la última", () => {
    expect(vecina(ids, null, 1)).toBe("a");
    expect(vecina(ids, null, -1)).toBe("c");
    expect(vecina(ids, "z", 1)).toBe("a");
  });
  it("en los extremos no da la vuelta, y sin lista no hay nada", () => {
    expect(vecina(ids, "c", 1)).toBeNull();
    expect(vecina(ids, "a", -1)).toBeNull();
    expect(vecina([], null, 1)).toBeNull();
  });
});
