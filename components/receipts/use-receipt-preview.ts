"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { isAxiosError } from "axios";
import { getBlobApiErrorMessage } from "@/lib/api-error";

export function useReceiptPreview() {
  const [url, setUrl] = useState("");
  const urlRef = useRef("");
  const close = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = "";
    setUrl("");
  }, []);
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );
  // EN: Validate before replacing the preview; each replaced or unmounted URL is released.
  // FI: Tarkista vastaus ennen esikatselun vaihtamista; jokainen korvattu tai poistettu URL vapautetaan.
  const load = async (
    path: string,
    payload: Record<string, unknown>,
    errorMessage = "Virheellinen kuittivastaus",
  ) => {
    const response = await api
      .post(path, payload, { responseType: "blob" })
      .catch(async (error: unknown) => {
        if (isAxiosError(error))
          error.message = await getBlobApiErrorMessage(
            error,
            "Kuittia ei voitu ladata. Yritä uudelleen.",
          );
        throw error;
      });
    if (
      !String(response.headers["content-type"] || "").includes(
        "application/pdf",
      ) ||
      !(response.data instanceof Blob)
    )
      throw new Error(errorMessage);
    const next = URL.createObjectURL(response.data);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next;
    setUrl(next);
  };
  return { url, load, close };
}
