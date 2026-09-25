"use client";

import { useState } from "react";
import OwnerModal from "@/components/OwnerModal";

export default function OwnerAccess() {
  const [isOwnerModalOpen, setIsOwnerModalOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOwnerModalOpen(true)}
        className="text-xs text-[#6F745E] opacity-50 hover:opacity-100"
      >
        Owner
      </button>

      <OwnerModal
        isOpen={isOwnerModalOpen}
        onClose={() => setIsOwnerModalOpen(false)}
      />
    </>
  );
}