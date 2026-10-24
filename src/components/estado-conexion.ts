"use client";

import { useSyncExternalStore } from "react";

/**
 * 056 — Cómo está el canal en tiempo real, compartido entre los `useEvents`
 * de la página (cada uno abre su conexión) y la banda «sin conexión» (D5).
 * Basta con que uno esté caído para avisar.
 */

type Conexion = { caidaDesde: number | null; reintentar: () => void };

const conexiones = new Map<number, Conexion>();
const oyentes = new Set<() => void>();
let siguienteId = 1;
let instantanea: number | null = null;

function avisar() {
  // La instantánea es «desde cuándo hay alguna caída»: así React solo vuelve
  // a pintar cuando eso cambia.
  let desde: number | null = null;
  for (const c of conexiones.values()) {
    if (c.caidaDesde !== null) desde = desde === null ? c.caidaDesde : Math.min(desde, c.caidaDesde);
  }
  if (desde === instantanea) return;
  instantanea = desde;
  for (const f of oyentes) f();
}

/** Una conexión nueva se anota y recibe con qué reportar su estado. */
export function registrarConexion(reintentar: () => void): {
  abierta: () => void;
  caida: () => void;
  quitar: () => void;
} {
  const id = siguienteId++;
  conexiones.set(id, { caidaDesde: null, reintentar });
  return {
    abierta: () => {
      const c = conexiones.get(id);
      if (c && c.caidaDesde !== null) {
        c.caidaDesde = null;
        avisar();
      }
    },
    caida: () => {
      const c = conexiones.get(id);
      if (c && c.caidaDesde === null) {
        c.caidaDesde = Date.now();
        avisar();
      }
    },
    quitar: () => {
      conexiones.delete(id);
      avisar();
    },
  };
}

/** «Reintentar ahora»: todas las conexiones caídas vuelven a abrir ya. */
export function reintentarConexiones(): void {
  for (const c of conexiones.values()) if (c.caidaDesde !== null) c.reintentar();
}

/** Desde cuándo está caído el tiempo real, o null si todo está abierto. */
export function useCaidaDesde(): number | null {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => instantanea,
    () => null
  );
}
