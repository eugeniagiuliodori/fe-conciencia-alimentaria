export type EstadoProductosOrganicos =
  | "todos"
  | "algunos"
  | "ninguno"
  | "no_verificado";

export type TipoUbicacion =
  | "fisica"
  | "online"
  | "mixta";

export type TipoContacto =
  | "telefono"
  | "whatsapp"
  | "email"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "otro";

export type ModalidadVenta =
  | "presencial"
  | "online"
  | "envios"
  | "retiro_en_local";

export type ProveedorMapa = "google_maps";

export type ProductoNegocio = {
  nombre: string;
  categoria: string | null;
};

export type ContactoNegocio = {
  tipo: TipoContacto;
  valor: string;
  ubicacionId: string | null;
};

export type MapaNegocio = {
  latitud: number | null;
  longitud: number | null;
  url: string | null;
  proveedor: ProveedorMapa;
};

export type DireccionNegocio = {
  texto: string | null;

  /**
   * Identificador compatible con la división administrativa
   * del dataset geográfico normalizado.
   *
   * Ejemplo:
   * "cordoba"
   */
  divisionId: string | null;

  provincia: string | null;
  ciudad: string | null;
  codigoPostal: string | null;
};

export type UbicacionNegocio = {
  id: string;
  tipo: TipoUbicacion;
  nombreSucursal: string | null;
  direccion: DireccionNegocio;
  imagenes: string[];
  mapa: MapaNegocio;
  descripcionComoLlegar: string | null;
};

export type FuenteNegocio = {
  tipo: string;
  url: string;
};

export type NegocioNaturista = {
  id: string;

  nombreFantasia: string | null;
  nombreLegal: string | null;
  cuit: string | null;

  logoOficialUrl: string | null;
  descripcion: string | null;

  productos: ProductoNegocio[];
  contactos: ContactoNegocio[];

  estadoProductosOrganicos: EstadoProductosOrganicos;

  tiendaOnlineUrl: string | null;
  sitioWebUrl: string | null;

  modalidadesVenta: ModalidadVenta[];

  ubicaciones: UbicacionNegocio[];

  /**
   * Metadatos internos de procedencia.
   * No necesariamente deben ser expuestos por el BFF.
   */
  fuentes: FuenteNegocio[];

  /**
   * Información interna de curación/verificación.
   * Tampoco necesariamente debe llegar al cliente.
   */
  observaciones: string | null;
};

export type FuenteDatasetNegocios = {
  snapshotVersion: number;
  generadoEn: string;
  sha256: string;
};

export type PaisDatasetNegocios = {
  id: "AR";
  nombre: "Argentina";
};

export type NegociosNaturistasDataset = {
  schemaVersion: 1;
  source: FuenteDatasetNegocios;
  pais: PaisDatasetNegocios;
  negocios: NegocioNaturista[];
};

export type NegocioPublico = Omit<
  NegocioNaturista,
  "fuentes" | "observaciones"
>;

export type PaginationItem =
  | number
  | "ellipsis";