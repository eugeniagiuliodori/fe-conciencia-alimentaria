"use client";

import { useRef, useState } from "react";

export  function ModoCocina() {
  const [activo, setActivo] = useState(false);

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const activar = async () => {
    if (!("wakeLock" in navigator)) {
      console.log("Este navegador no soporta Screen Wake Lock.");
      return;
    }

    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      setActivo(true);

      console.log("Wake Lock activado");
    } catch (error) {
      console.error("No se pudo activar Wake Lock:", error);
    }
  };

  const desactivar = async () => {
    await wakeLockRef.current?.release();

    wakeLockRef.current = null;
    setActivo(false);

    console.log("Wake Lock desactivado");
  };

  return (
    <button
      type="button"
      onClick={activo ? desactivar : activar}
      className="text-sm rounded-lg border border-accent px-2 py-2 text-accent cursor-pointer"
    >
      {activo ? "✓ Pantalla activa" : "☀ Mantener pantalla activa"}
    </button>
  );
}