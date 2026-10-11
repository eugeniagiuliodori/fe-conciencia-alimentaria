export type Ciudad = string;

export type DivisionAdministrativa = {
  id: string;
  nombre: string;
  codigo: string | null;
  tipo: string | null;
  ciudades: Ciudad[];
};

export type Pais = {
  id: string;
  nombre: string;
  codigoIso2: string | null;
};

export type GeografiaPais = {
  schemaVersion: 1;
  sourceSha256: string;
  pais: Pais;
  divisiones: DivisionAdministrativa[];
};

export type PaisIndice = {
  id: string;
  nombre: string;
  codigoIso2: string | null;
  archivo: string;
  cantidadDivisiones: number;
  cantidadCiudades: number;
};

export type GeografiaIndice = {
  schemaVersion: 1;
  sourceSha256: string;
  paises: PaisIndice[];
};

export type PaisGeografia = Pick<
  PaisIndice,
  "id" | "nombre" | "codigoIso2"
>;

export type DivisionGeografia = Pick<
  DivisionAdministrativa,
  "id" | "nombre" | "codigo" | "tipo"
>;