import alimentosPorEstacion from "@/data/alimentos_estacion.json";

export type Estacion =
  keyof typeof alimentosPorEstacion;

export type Alimento = {
  nombre_informal: string;
  nombre_cientifico: string;
  tipo: string;
  zona_principal_produccion: string[];
};

export type PaginationItem =
  | number
  | "ellipsis-start"
  | "ellipsis-end";

export type ConsultaRangoAlimentosEstacion = {
  estacion: Estacion;
  offset: number;
  limit: number;
};

export type ResultadoRangoAlimentosEstacion = {
  alimentos: Alimento[];
  offset: number;
  limit: number;
  total: number;
};
