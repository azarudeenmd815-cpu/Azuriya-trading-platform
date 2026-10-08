"use client";

import { useState } from "react";
import Image from "next/image";
import type { EcosystemItem } from "@/lib/ecosystem-catalog";

export function EcosystemLogo({
  item,
}: {
  item: Pick<EcosystemItem, "name" | "logo" | "logoSurface">;
}) {
  const [failed, setFailed] = useState(false);
  const initials = item.name
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className={`ec-logo${item.logoSurface === "dark" ? " ec-logo-dark" : ""}${!item.logo || failed ? " ec-logo-text" : ""}`}
      aria-hidden="true"
    >
      {item.logo && !failed ? (
        <Image
          src={item.logo}
          alt=""
          width={72}
          height={72}
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{initials}</span>
      )}
    </span>
  );
}
