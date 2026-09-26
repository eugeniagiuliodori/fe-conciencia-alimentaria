"use client";

import { useEffect } from "react";
import {
  readTabVisitState,
  updateLastActive,
} from "@/features/visit-tracking/state/ storage";
import { determineVisitSession } from "@/features/visit-tracking/ visit-session";

const VISIT_TIMEOUT_MS =
  2 * 60 * 60 * 1000;

const ACTIVITY_WRITE_INTERVAL_MS =
  30_000;

export function VisitTracker() {
  useEffect(() => {
    let disposed = false;

    let lastActivityWriteAt = 0;

    /*
     * Evita que varios eventos casi simultáneos
     * (por ejemplo focus + visibilitychange)
     * ejecuten en paralelo la lógica de actividad.
     */
    let activityPromise:
      Promise<void> | null = null;

    async function initialize(): Promise<void> {
      try {
        /*
         * En una carga o recarga NO actualizamos
         * lastActive antes de determinar la visita.
         *
         * El estado existente tiene que ser evaluado
         * tal como estaba antes de esta nueva actividad.
         */
        await determineVisitSession();

        if (disposed) return;

        const now = Date.now();

        updateLastActive(now);
        lastActivityWriteAt = now;
      } catch (error) {
        console.error(
          "Visit tracking initialization failed:",
          error,
        );
      }
    }

    function registerActivity(): void {
      if (disposed) return;

      /*
       * Si ya estamos procesando una actividad que
       * necesitó coordinación global, no iniciamos
       * otra simultáneamente.
       */
      if (activityPromise) {
        return;
      }

      const now = Date.now();
      const state = readTabVisitState();

      /*
       * Sin lastActive o con 2 horas de inactividad,
       * NO podemos escribir "now" todavía.
       *
       * Primero hay que determinar si existe otra
       * pestaña con una visita vigente.
       */
      if (
        state.lastActive === null ||
        now - state.lastActive >=
          VISIT_TIMEOUT_MS
      ) {
        activityPromise =
          determineVisitSession()
            .then(() => {
              if (disposed) return;

              const activityTime =
                Date.now();

              updateLastActive(
                activityTime,
              );

              lastActivityWriteAt =
                activityTime;
            })
            .catch((error) => {
              console.error(
                "Visit determination failed:",
                error,
              );
            })
            .finally(() => {
              activityPromise = null;
            });

        return;
      }

      /*
       * La visita local todavía está vigente.
       *
       * No necesitamos involucrar al Service Worker.
       * Solamente refrescamos el timestamp local,
       * con throttle para evitar escrituras excesivas.
       */
      if (
        now - lastActivityWriteAt <
        ACTIVITY_WRITE_INTERVAL_MS
      ) {
        return;
      }

      updateLastActive(now);
      lastActivityWriteAt = now;
    }

    function handleVisibilityChange(): void {
      if (
        document.visibilityState ===
        "visible"
      ) {
        registerActivity();
      }
    }

    /*
     * Primero iniciamos la determinación correspondiente
     * a la carga/reload de esta pestaña.
     */
    void initialize();

    window.addEventListener(
      "pointerdown",
      registerActivity,
    );

    window.addEventListener(
      "keydown",
      registerActivity,
    );

    window.addEventListener(
      "scroll",
      registerActivity,
      { passive: true },
    );

    window.addEventListener(
      "touchstart",
      registerActivity,
      { passive: true },
    );

    window.addEventListener(
      "focus",
      registerActivity,
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    return () => {
      disposed = true;

      window.removeEventListener(
        "pointerdown",
        registerActivity,
      );

      window.removeEventListener(
        "keydown",
        registerActivity,
      );

      window.removeEventListener(
        "scroll",
        registerActivity,
      );

      window.removeEventListener(
        "touchstart",
        registerActivity,
      );

      window.removeEventListener(
        "focus",
        registerActivity,
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, []);

  return null;
}