"use client";

import { createContext, useContext, useState } from "react";

export type IdentificationStatus = "anonymous" | "identified";

type IdentificationContextValue = {
  status: IdentificationStatus;
  confirmSessionStarted: () => void;
  confirmSessionClosed: () => void;
};

const IdentificationContext = createContext<IdentificationContextValue | null>(null);

export function IdentificationProvider({
  initialStatus,
  children,
}: {
  initialStatus: IdentificationStatus;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<IdentificationStatus>(initialStatus);

  return (
    <IdentificationContext.Provider
      value={{
        status,
        confirmSessionStarted: () => setStatus("identified"),
        confirmSessionClosed: () => setStatus("anonymous"),
      }}
    >
      {children}
    </IdentificationContext.Provider>
  );
}

export function useIdentification(): IdentificationContextValue {
  const context = useContext(IdentificationContext);
  if (context === null) {
    throw new Error("useIdentification debe usarse dentro de IdentificationProvider");
  }
  return context;
}
