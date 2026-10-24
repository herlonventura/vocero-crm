import { describe, expect, it } from "vitest";
import {
  claseReenvio,
  desplazamientoBurbuja,
  DESLIZAR_MAX_PX,
  llevaPie,
  nombreReenvio,
  sueltaYCita,
} from "@/lib/reenvio";

/** 059 — Qué se reenvía (D1) y el gesto de deslizar para responder (D6). */
describe("059 — qué se reenvía", () => {
  const texto = (type: string, text: string | null) => ({ type, text, media: null });
  const adjunto = (kind: string) => ({ type: kind, text: null, media: { kind } });

  it("el texto, la plantilla y cualquier mensaje con texto salen como texto", () => {
    expect(claseReenvio(texto("text", "Hola"))).toBe("texto");
    expect(claseReenvio(texto("template", "Tu cita es mañana"))).toBe("texto");
    expect(claseReenvio(texto("interactive", "Sí, me interesa"))).toBe("texto");
  });

  it("sin texto, o solo espacios, no hay nada que reenviar", () => {
    expect(claseReenvio(texto("text", null))).toBeNull();
    expect(claseReenvio(texto("text", "   "))).toBeNull();
  });

  it("imagen, sticker, video, audio y documento salen como adjunto", () => {
    for (const k of ["image", "sticker", "video", "audio", "document"]) {
      expect(claseReenvio(adjunto(k))).toBe("adjunto");
    }
  });

  it("ubicación, contacto y reacción no se reenvían", () => {
    expect(claseReenvio(adjunto("location"))).toBeNull();
    expect(claseReenvio(adjunto("contacts"))).toBeNull();
    expect(claseReenvio(texto("reaction", "👍"))).toBeNull();
    expect(claseReenvio(texto("location", "Calle 5"))).toBeNull();
  });

  it("nombra lo que reenvía y solo imagen, video y documento llevan pie", () => {
    expect(nombreReenvio(adjunto("image"))).toEqual({ titulo: "Reenviar imagen", hecho: "Imagen reenviada" });
    expect(nombreReenvio(texto("text", "x")).titulo).toBe("Reenviar mensaje");
    expect(nombreReenvio(adjunto("document")).hecho).toBe("Documento reenviado");
    expect(llevaPie(adjunto("image"))).toBe(true);
    expect(llevaPie(adjunto("document"))).toBe(true);
    expect(llevaPie(adjunto("audio"))).toBe(false);
    expect(llevaPie(texto("text", "x"))).toBe(false);
  });
});

describe("059 — deslizar para responder", () => {
  it("un movimiento más vertical que horizontal es desplazar el hilo", () => {
    expect(desplazamientoBurbuja(30, 60)).toBe(0);
    expect(desplazamientoBurbuja(-40, -40)).toBe(0);
  });

  it("la burbuja sigue al dedo hacia los dos lados, con tope", () => {
    expect(desplazamientoBurbuja(40, 5)).toBe(40);
    expect(desplazamientoBurbuja(-40, 5)).toBe(-40);
    expect(desplazamientoBurbuja(200, 10)).toBe(DESLIZAR_MAX_PX);
    expect(desplazamientoBurbuja(-200, 10)).toBe(-DESLIZAR_MAX_PX);
  });

  it("soltar a 56 px o más cita, hacia la izquierda o la derecha", () => {
    expect(sueltaYCita(30)).toBe(false);
    expect(sueltaYCita(-55)).toBe(false);
    expect(sueltaYCita(56)).toBe(true);
    expect(sueltaYCita(-72)).toBe(true);
  });
});
