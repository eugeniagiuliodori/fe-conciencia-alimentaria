import { useState } from "react";
  const [, setPaisId] = useState("");

export function handlePaisChange(paisId:string) {
    setPaisId(paisId);
}