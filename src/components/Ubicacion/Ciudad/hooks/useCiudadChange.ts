import { useState } from "react";
  const [, setCiudad] = useState("");

export function handleCiudadChange(ciudad:string) {
    setCiudad(ciudad);
}