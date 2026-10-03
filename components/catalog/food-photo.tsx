"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import config from "@/app/config";

type Props = {
  filename: string;
  alt: string;
  className: string;
  sizes: string;
  variant?: "card" | "detail";
  fit?: "cover" | "contain";
};

const safeFilename = (filename: string) =>
  filename.length > 0 &&
  filename.length <= 160 &&
  !filename.startsWith(".") &&
  /^[\w.-]+\.(?:jpe?g|png|webp|gif)$/i.test(filename);

export const originalImageUrl = (filename: string) =>
  safeFilename(filename)
    ? `${config.apiServer}/uploads/${encodeURIComponent(filename)}`
    : null;

function Photo({
  filename,
  alt,
  className,
  sizes,
  variant = "card",
  fit = "cover",
}: Props) {
  const [attempt, setAttempt] = useState(0);
  const encoded = encodeURIComponent(filename);
  const src =
    attempt === 0
      ? `${config.apiServer}/uploads/variants/${variant}/${encoded}`
      : originalImageUrl(filename)!;

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-[#efece6] ${className}`}
    >
      {safeFilename(filename) && attempt < 2 ? (
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized
          loading="lazy"
          decoding="async"
          sizes={sizes}
          className={fit === "contain" ? "object-contain" : "object-cover"}
          onError={() => setAttempt((current) => Math.min(2, current + 1))}
        />
      ) : (
        <ImageIcon aria-hidden="true" className="size-7 text-olive/40" />
      )}
    </div>
  );
}

// EN: Reset failures only when the image identity changes; preserve mounted photos during cart updates and allow older APIs to serve originals.
// FI: Nollaa virheet vain kuvan tunnisteen muuttuessa; säilytä kuvat ostoskoripäivityksissä ja salli vanhojen API:en alkuperäiskuvat.
export default function FoodPhoto(props: Props) {
  return (
    <Photo key={`${props.filename}:${props.variant ?? "card"}`} {...props} />
  );
}
