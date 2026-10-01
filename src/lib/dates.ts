export function obtenerMesActual(): string {
  const hoy = new Date(Date.now());

  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");

  return `${anio}-${mes}`;
}

export async function obtenerFuentesPorMes(
  mes: string
): Promise<string[]> {

  // Validamos el formato YYYY-MM.
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    throw new Error("Formato de mes inválido. Usá YYYY-MM.");
  }

  const respuesta = await fetch("/fuentes.tsv");

  if (!respuesta.ok) {
    throw new Error("No se pudo leer fuentes.tsv");
  }

  const contenido = await respuesta.text();
  return contenido
  .split(/\r?\n/)
  .slice(1)
  .map(linea => ({
    fecha: linea.slice(0, 10),
    url: linea.slice(10).trim(),
  }))
  .filter(({ fecha, url }) =>
    fecha.startsWith(`${mes}-`) && url.length > 0
  )
  .map(({ url }) => url);
}