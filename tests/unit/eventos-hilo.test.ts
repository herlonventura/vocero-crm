import { describe, expect, it } from "vitest";
import { textoEventoEtapa, textoTraspaso } from "@/lib/eventos-hilo";
import { intercalarNotas } from "@/lib/notas";

/** 054 — El texto de cada evento del hilo y dónde cae entre los mensajes. */
describe("054 — cambios de etapa", () => {
  const ev = (p: Partial<Parameters<typeof textoEventoEtapa>[0]> = {}) =>
    textoEventoEtapa({
      fromStageName: "Nuevo",
      toStageName: "Interesado",
      lossReason: null,
      source: "dueno",
      actorNombre: "Ana",
      ...p,
    });

  it("dice a dónde pasó y quién lo movió", () => {
    expect(ev()).toBe("Pasó a Interesado · por Ana");
  });

  it("el nacimiento del lead dice que entró al embudo", () => {
    expect(ev({ fromStageName: null, toStageName: "Nuevo", actorNombre: null, source: "sistema" })).toBe(
      "Entró al embudo en Nuevo"
    );
  });

  it("el agente se nombra; el sistema no", () => {
    expect(ev({ actorNombre: null, source: "bot" })).toBe("Pasó a Interesado · por el agente");
    expect(ev({ actorNombre: null, source: "sistema" })).toBe("Pasó a Interesado");
  });

  it("pasar a perdido lleva el motivo", () => {
    expect(ev({ toStageName: "Perdido", lossReason: "precio" })).toBe(
      "Pasó a Perdido · Le pareció caro · por Ana"
    );
    expect(ev({ toStageName: "Perdido", lossReason: "inventado" })).toBe("Pasó a Perdido · por Ana");
  });
});

describe("054 — traspaso a una persona", () => {
  it("con las palabras del panel del contacto", () => {
    expect(textoTraspaso("cliente")).toBe("La IA se pausó: el cliente pidió un humano");
    expect(textoTraspaso("hostilidad")).toBe("La IA se pausó: el cliente se puso agresivo y el agente se retiró");
    expect(textoTraspaso(null)).toBe("La IA se pausó");
    expect(textoTraspaso("desconocido")).toBe("La IA se pausó");
  });
});

describe("054 — intercalado con mensajes y notas", () => {
  it("cada cosa cae en su lugar por hora; con la misma hora, después del mensaje", () => {
    const mensajes = [{ createdAt: "2026-10-23T10:00:00.000Z" }, { createdAt: "2026-10-23T12:00:00.000Z" }];
    const r = intercalarNotas(mensajes, [
      { id: "e2", createdAt: "2026-10-23T13:00:00.000Z" },
      { id: "e0", createdAt: "2026-10-23T09:00:00.000Z" },
      { id: "n1", createdAt: "2026-10-23T10:00:00.000Z" },
    ]);
    expect(r.antes.map((l) => l.map((x) => x.id))).toEqual([["e0"], ["n1"]]);
    expect(r.alFinal.map((x) => x.id)).toEqual(["e2"]);
  });
});
