"use client";
import { useState, useRef, type FormEvent } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { invalidateCatalogCache } from "@/lib/catalog-reads";
import { getApiErrorMessage } from "@/lib/api-error";
import type { Food, FoodCategory, FoodKind } from "@/lib/catalog-contracts";
// EN: The hook owns the complete edit and upload draft; stable file refs reset only on save or explicit reset.
// FI: Hook hallitsee koko muokkaus- ja latausluonnosta; pysyvät tiedostoviitteet nollautuvat vain tallennuksessa tai erillisessä nollauksessa.
export function useMenuItemEditor(
  categories: FoodCategory[],
  load: () => Promise<void>,
) {
  const [editingFood, setEditingFood] = useState<Food | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [foodTypeId, setFoodTypeId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [remark, setRemark] = useState("");
  const [price, setPrice] = useState("0");
  const [foodKind, setFoodKind] = useState<FoodKind>("food");
  const [currentImage, setCurrentImage] = useState("");
  const [currentDetailImage, setCurrentDetailImage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedDetailFile, setSelectedDetailFile] = useState<File | null>(
    null,
  );
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detailFileInputRef = useRef<HTMLInputElement>(null);
  const resetFileInput = () => {
    setSelectedFile(null);
    setSelectedDetailFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (detailFileInputRef.current) detailFileInputRef.current.value = "";
  };

  const openCreate = () => {
    setEditingFood(null);
    setFoodTypeId(categories[0]?.id ?? null);
    setName("");
    setRemark("");
    setPrice("0");
    setFoodKind("food");
    setCurrentImage("");
    setCurrentDetailImage("");
    setFormError("");
    resetFileInput();
    setEditorOpen(true);
  };

  const openEdit = (food: Food) => {
    setEditingFood(food);
    setFoodTypeId(food.foodTypeId);
    setName(food.name);
    setRemark(food.remark);
    setPrice(String(food.price));
    setFoodKind(food.foodType);
    setCurrentImage(food.img);
    setCurrentDetailImage(food.detailImg ?? "");
    setFormError("");
    resetFileInput();
    setEditorOpen(true);
  };

  const uploadImage = async (file: File | null, currentImage: string) => {
    if (!file) return currentImage;
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post("/food/upload", formData);
    if (
      typeof response.data?.fileName !== "string" ||
      !response.data.fileName
    ) {
      throw new Error("Palvelin palautti virheellisen kuvatiedoston.");
    }
    return response.data.fileName;
  };

  const saveFood = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const numericPrice = Number(price);
    if (
      !foodTypeId ||
      !normalizedName ||
      !Number.isInteger(numericPrice) ||
      numericPrice < 0
    ) {
      setFormError(
        "Kategoria, nimi ja kokonainen vähintään 0 oleva hinta ovat pakollisia.",
      );
      return;
    }

    setIsSaving(true);
    setFormError("");
    try {
      const img = await uploadImage(selectedFile, currentImage);
      const detailImg = await uploadImage(
        selectedDetailFile,
        currentDetailImage,
      );
      const payload = {
        foodTypeId,
        name: normalizedName,
        remark: remark.trim(),
        price: numericPrice,
        img,
        detailImg,
        foodType: foodKind,
      };
      if (editingFood)
        await api.put("/food/update", { ...payload, id: editingFood.id });
      else await api.post("/food/create", payload);
      invalidateCatalogCache();
      await load();
      setEditorOpen(false);
      toast.success("Ruokalaji tallennettiin.");
    } catch (reason: unknown) {
      setFormError(
        getApiErrorMessage(reason, "Ruokalajia ei voitu tallentaa."),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return {
    setCurrentDetailImage,
    editingFood,
    editorOpen,
    foodTypeId,
    name,
    remark,
    price,
    foodKind,
    currentImage,
    currentDetailImage,
    selectedFile,
    selectedDetailFile,
    formError,
    isSaving,
    fileInputRef,
    detailFileInputRef,
    openCreate,
    openEdit,
    saveFood,
    setEditorOpen,
    setFoodTypeId,
    setName,
    setRemark,
    setPrice,
    setFoodKind,
    setSelectedFile,
    setSelectedDetailFile,
  };
}
