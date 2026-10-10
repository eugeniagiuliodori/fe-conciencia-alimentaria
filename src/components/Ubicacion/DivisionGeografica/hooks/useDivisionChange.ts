import { useState } from "react";
  const [, setDivisionId] = useState("");

export function handleDivisionChange(divisionId:string) {
    setDivisionId(divisionId);
}