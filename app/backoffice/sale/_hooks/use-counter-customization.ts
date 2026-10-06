import { useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import type {
  Taste,
  FoodSize,
  SaleTempDetail,
  SaleTemp,
} from "@/lib/sale-contracts";
import type useCounterDraft from "./use-counter-draft";
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unexpected error";

export default function useCounterCustomization({
  checkoutBusy,
  draftLocked,
  draftMode,
  draftCart,
  refreshCart,
}: {
  checkoutBusy: boolean;
  draftLocked: boolean;
  draftMode: boolean;
  draftCart: ReturnType<typeof useCounterDraft>;
  refreshCart: () => Promise<unknown>;
}) {
  const [tastes, setTastes] = useState<Taste[]>([]);
  const [sizes, setSizes] = useState<FoodSize[]>([]);
  const [saleTempDetails, setSaleTempDetails] = useState<SaleTempDetail[]>([]);
  const [saleTempId, setSaleTempId] = useState(0);
  const [customizationBusy, setCustomizationBusy] = useState(false);
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const openModalEdit = async (item: SaleTemp) => {
    if (customizationBusy || checkoutBusy || draftLocked) return;
    setCustomizationOpen(true);
    setSaleTempId(item.id);
    setSaleTempDetails([]);
    setTastes([]);
    setSizes([]);
    if (draftMode) {
      try {
        setCustomizationBusy(true);
        const response = await api.get(`/counterOrder/options/${item.Food.id}`);
        const result = response.data?.results;
        if (
          !isRecord(result) ||
          !Array.isArray(result.tastes) ||
          !Array.isArray(result.foodSizes)
        )
          throw new Error("Invalid customization options");
        setTastes(result.tastes as Taste[]);
        setSizes(result.foodSizes as FoodSize[]);
        setSaleTempDetails(draftCart.detailsFor(item.Food.id));
      } catch (error) {
        setCustomizationOpen(false);
        toast.error("Unable to load options", {
          description: errorMessage(error),
        });
      } finally {
        setCustomizationBusy(false);
      }
      return;
    }
    await generateSaleTempDetail(item.id);
  };

  // Loads data sale temp info for the current workflow.
  const fetchDataSaleTempInfo = async (saleTempId: number) => {
    try {
      const res = await api.get("/saleTemp/info/" + saleTempId);
      const result = res.data?.results;
      if (
        !isRecord(result) ||
        !Array.isArray(result.saleTempDetails) ||
        !isRecord(result.Food)
      )
        throw new Error("Invalid customization response");
      const foodType = result.Food.FoodType;
      if (
        !isRecord(foodType) ||
        !Array.isArray(foodType.tastes) ||
        !Array.isArray(foodType.foodSizes)
      )
        throw new Error("Invalid customization options");
      setSaleTempDetails(result.saleTempDetails as SaleTempDetail[]);
      setTastes(foodType.tastes as Taste[]);
      setSizes(foodType.foodSizes as FoodSize[]);
    } catch (e: unknown) {
      toast.error("Error", {
        description: errorMessage(e),
      });
    }
  };
  // Coordinates generate sale temp detail behavior for this module.
  const generateSaleTempDetail = async (saleTempId: number) => {
    try {
      setCustomizationBusy(true);
      const payload = {
        saleTempId: saleTempId,
      };
      await api.post("/saleTemp/generateSaleTempDetail", payload);
      await refreshCart();
      await fetchDataSaleTempInfo(saleTempId);
    } catch (e: unknown) {
      toast.error("Error", {
        description: errorMessage(e),
      });
    } finally {
      setCustomizationBusy(false);
    }
  };
  // Updates taste without changing user-visible behavior.
  const selectTaste = async (
    tasteId: number,
    saleTempDetailId: number,
    saleTempId: number,
  ) => {
    if (customizationBusy || checkoutBusy || draftLocked) return;
    if (draftMode) {
      setSaleTempDetails(
        await draftCart.changeDetail(saleTempDetailId, { tasteId }),
      );
      return;
    }
    try {
      setCustomizationBusy(true);
      const payload = {
        saleTempDetailId: saleTempDetailId,
        tasteId: tasteId,
      };
      await api.put("/saleTemp/selectTaste", payload);
      await fetchDataSaleTempInfo(saleTempId);
    } catch (e: unknown) {
      toast.error("Error", {
        description: errorMessage(e),
      });
    } finally {
      setCustomizationBusy(false);
    }
  };
  // Coordinates un select taste behavior for this module.
  const unSelectTaste = async (
    saleTempDetailId: number,
    saleTempId: number,
  ) => {
    if (customizationBusy || checkoutBusy || draftLocked) return;
    if (draftMode) {
      setSaleTempDetails(
        await draftCart.changeDetail(saleTempDetailId, { tasteId: null }),
      );
      return;
    }
    try {
      setCustomizationBusy(true);
      const payload = {
        saleTempDetailId: saleTempDetailId,
      };
      await api.put("/saleTemp/unSelectTaste", payload);
      await fetchDataSaleTempInfo(saleTempId);
    } catch (e: unknown) {
      toast.error("Error", {
        description: errorMessage(e),
      });
    } finally {
      setCustomizationBusy(false);
    }
  };
  // Updates size without changing user-visible behavior.
  const selectSize = async (
    sizeId: number | null,
    saleTempDetailId: number,
    saleTempId: number,
  ) => {
    if (customizationBusy || checkoutBusy || draftLocked) return;
    if (draftMode) {
      setSaleTempDetails(
        await draftCart.changeDetail(saleTempDetailId, { foodSizeId: sizeId }),
      );
      return;
    }
    try {
      setCustomizationBusy(true);
      const payload = {
        sizeId: sizeId,
        saleTempDetailId: saleTempDetailId,
      };
      await api.put("/saleTemp/selectSize", payload);
      await fetchDataSaleTempInfo(saleTempId);
      await refreshCart();
    } catch (e: unknown) {
      toast.error("Error", {
        description: errorMessage(e),
      });
    } finally {
      setCustomizationBusy(false);
    }
  };
  // Creates sale temp detail with the current contract.
  const createSaleTempDetail = async () => {
    if (customizationBusy || checkoutBusy || draftLocked) return;
    if (draftMode) {
      await draftCart.addItem(saleTempId);
      setSaleTempDetails(draftCart.detailsFor(saleTempId));
      return;
    }
    try {
      setCustomizationBusy(true);
      const payload = {
        saleTempId: saleTempId,
      };
      await api.post("/saleTemp/createSaleTempDetail", payload);
      await refreshCart();
      await fetchDataSaleTempInfo(saleTempId);
    } catch (e: unknown) {
      toast.error("Error", {
        description: errorMessage(e),
      });
    } finally {
      setCustomizationBusy(false);
    }
  };
  // Removes or clears all sale temp detail modal using the existing workflow.
  const removeAllSaleTempDetailModal = async (saleTempDetailId: number) => {
    if (customizationBusy || checkoutBusy || draftLocked) return;
    if (draftMode) {
      const remaining = await draftCart.removeDetail(saleTempDetailId);
      setSaleTempDetails(remaining);
      if (remaining.length === 0) {
        setCustomizationOpen(false);
        setSaleTempId(0);
      }
      return;
    }
    try {
      setCustomizationBusy(true);
      const payload = {
        saleTempDetailId: saleTempDetailId,
      };
      await api.delete("/saleTemp/removeSaleTempDetailModal", {
        data: payload,
      });
      await refreshCart();
      if (saleTempDetails.length === 1) {
        setCustomizationOpen(false);
        setSaleTempDetails([]);
        setSaleTempId(0);
      } else {
        await fetchDataSaleTempInfo(saleTempId);
      }
    } catch (e: unknown) {
      toast.error("Error", {
        description: errorMessage(e),
      });
    } finally {
      setCustomizationBusy(false);
    }
  };
  return {
    tastes,
    sizes,
    saleTempDetails,
    saleTempId,
    customizationBusy,
    customizationOpen,
    setCustomizationOpen,
    openModalEdit,
    selectTaste,
    unSelectTaste,
    selectSize,
    createSaleTempDetail,
    removeAllSaleTempDetailModal,
  };
}
