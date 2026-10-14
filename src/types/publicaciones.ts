// src/types/publicaciones.ts

import type {
  Publication,
} from "@/data/publications";

export type ConsultaRangoPublicaciones = {
  offset: number;
  limit: number;
};

export type ResultadoRangoPublicaciones = {
  publicaciones: Publication[];
  offset: number;
  limit: number;
  total: number;
};