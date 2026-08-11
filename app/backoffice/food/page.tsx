"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import config from "@/app/config";
import api from "@/lib/api";
import MyModal from "../components/mymodal";

type FoodKind = "food" | "drink";
type FoodCategory = { id: number; name: string; remark: string };
type Food = {
  id: number;
  foodTypeId: number;
  name: string;
  remark: string;
  price: number;
  img: string;
  foodType: FoodKind;
  FoodType: FoodCategory;
};

// Validates is category before it is used.
const isCategory = (value: unknown): value is FoodCategory => {
  if (!value || typeof value !== "object") return false;
  const category = value as Record<string, unknown>;
  return (
    typeof category.id === "number" &&
    typeof category.name === "string" &&
    typeof category.remark === "string"
  );
};

// Validates is food before it is used.
const isFood = (value: unknown): value is Food => {
  if (!value || typeof value !== "object") return false;
  const food = value as Record<string, unknown>;
  return (
    typeof food.id === "number" &&
    typeof food.foodTypeId === "number" &&
    typeof food.name === "string" &&
    typeof food.remark === "string" &&
    typeof food.price === "number" &&
    typeof food.img === "string" &&
    (food.foodType === "food" || food.foodType === "drink") &&
    isCategory(food.FoodType)
  );
};

// Loads error message for the current workflow.
const getErrorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Unable to complete the food request";
// Coordinates image url behavior for this module.
const imageUrl = (fileName: string) =>
  `${config.apiServer}/uploads/${fileName}`;

// Renders the food page interface.
export default function FoodPage() {
  const [foodTypes, setFoodTypes] = useState<FoodCategory[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);
  const [id, setId] = useState<number | null>(null);
  const [foodTypeId, setFoodTypeId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [remark, setRemark] = useState("");
  const [price, setPrice] = useState("0");
  const [img, setImg] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [foodType, setFoodType] = useState<FoodKind>("food");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [foodResponse, categoryResponse] = await Promise.all([
        api.get("/food/list"),
        api.get("/foodType/list"),
      ]);
      const nextFoods = foodResponse.data?.results;
      const nextCategories = categoryResponse.data?.results;
      if (
        !Array.isArray(nextFoods) ||
        !nextFoods.every(isFood) ||
        !Array.isArray(nextCategories) ||
        !nextCategories.every(isCategory)
      ) {
        throw new Error("Invalid food-management response");
      }
      setFoods(nextFoods);
      setFoodTypes(nextCategories);
      setFoodTypeId((current) => current ?? nextCategories[0]?.id ?? null);
    } catch (error: unknown) {
      await Swal.fire({
        icon: "error",
        title: "Error",
        text: getErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const requestId = window.setTimeout(() => void fetchData(), 0);
    return () => window.clearTimeout(requestId);
  }, [fetchData]);

  // Removes or clears form using the existing workflow.
  const clearForm = () => {
    setId(null);
    setFoodTypeId(foodTypes[0]?.id ?? null);
    setName("");
    setRemark("");
    setPrice("0");
    setImg("");
    setSelectedFile(null);
    setFoodType("food");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Coordinates edit behavior for this module.
  const edit = (food: Food) => {
    setId(food.id);
    setFoodTypeId(food.foodTypeId);
    setName(food.name);
    setRemark(food.remark);
    setPrice(String(food.price));
    setImg(food.img);
    setSelectedFile(null);
    setFoodType(food.foodType);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Coordinates upload image behavior for this module.
  const uploadImage = async () => {
    if (!selectedFile) return img;
    const formData = new FormData();
    formData.append("file", selectedFile);
    const response = await api.post("/food/upload", formData);
    if (
      typeof response.data?.fileName !== "string" ||
      !response.data.fileName
    ) {
      throw new Error("Invalid image-upload response");
    }
    return response.data.fileName;
  };

  // Handles save events and preserves existing side effects.
  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedRemark = remark.trim();
    const numericPrice = Number(price);
    if (
      !foodTypeId ||
      !normalizedName ||
      !Number.isInteger(numericPrice) ||
      numericPrice < 0
    ) {
      await Swal.fire({
        icon: "warning",
        title: "Validation",
        text: "Category, name, and a whole non-negative price are required",
      });
      return;
    }

    setIsSaving(true);
    try {
      const uploadedImage = await uploadImage();
      const payload = {
        foodTypeId,
        name: normalizedName,
        remark: normalizedRemark,
        price: numericPrice,
        img: uploadedImage,
        foodType,
      };
      if (id === null) await api.post("/food/create", payload);
      else await api.put("/food/update", { ...payload, id });
      await fetchData();
      document.getElementById("modalFood_btnClose")?.click();
      clearForm();
      await Swal.fire({
        icon: "success",
        title: "Saved",
        timer: 1000,
        showConfirmButton: false,
      });
    } catch (error: unknown) {
      await Swal.fire({
        icon: "error",
        title: "Error",
        text: getErrorMessage(error),
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handles remove events and preserves existing side effects.
  const handleRemove = async (food: Food) => {
    const confirmation = await Swal.fire({
      icon: "warning",
      title: "Confirm deletion",
      text: `Remove ${food.name} from sale?`,
      showCancelButton: true,
      confirmButtonText: "Remove",
    });
    if (!confirmation.isConfirmed) return;
    try {
      await api.delete(`/food/remove/${food.id}`);
      await fetchData();
    } catch (error: unknown) {
      await Swal.fire({
        icon: "error",
        title: "Error",
        text: getErrorMessage(error),
      });
    }
  };

  return (
    <>
      <div className="mt-3 card">
        <div className="card-header">Menu Items</div>
        <div className="card-body">
          <button
            className="btn btn-primary"
            data-bs-toggle="modal"
            data-bs-target="#modalFood"
            onClick={clearForm}
            disabled={foodTypes.length === 0}
          >
            <i className="fa fa-plus me-2" />
            Add Menu Item
          </button>
          {foodTypes.length === 0 && !isLoading && (
            <p className="mt-2 mb-0 text-danger">
              Create an active food category before adding food.
            </p>
          )}
          <table className="mt-3 table table-bordered table-striped">
            <thead>
              <tr>
                <th style={{ width: "100px" }}>Image</th>
                <th>Category</th>
                <th style={{ width: "100px" }}>Kind</th>
                <th>Name</th>
                <th>Remark</th>
                <th className="text-end" style={{ width: "100px" }}>
                  Price
                </th>
                <th style={{ width: "110px" }} />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center">
                    Loading foods…
                  </td>
                </tr>
              ) : foods.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center">
                    No active foods
                  </td>
                </tr>
              ) : (
                foods.map((food) => (
                  <tr key={food.id}>
                    <td>
                      {food.img && (
                        <img
                          src={imageUrl(food.img)}
                          alt={food.name}
                          width="100"
                        />
                      )}
                    </td>
                    <td>{food.FoodType.name}</td>
                    <td>
                      {food.foodType === "food" ? "อาหาร" : "เครื่องดื่ม"}
                    </td>
                    <td>{food.name}</td>
                    <td>{food.remark}</td>
                    <td className="text-end">{food.price}</td>
                    <td>
                      <button
                        className="btn btn-primary me-2"
                        data-bs-toggle="modal"
                        data-bs-target="#modalFood"
                        onClick={() => edit(food)}
                        aria-label={`Edit ${food.name}`}
                      >
                        <i className="fa fa-edit" />
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => void handleRemove(food)}
                        aria-label={`Remove ${food.name}`}
                      >
                        <i className="fa fa-times" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <MyModal
        id="modalFood"
        title={id === null ? "Add Menu Item" : "Edit Menu Item"}
      >
        <form onSubmit={handleSave}>
          <label htmlFor="food-category">Food category</label>
          <select
            id="food-category"
            className="form-select"
            value={foodTypeId ?? ""}
            onChange={(event) => setFoodTypeId(Number(event.target.value))}
            required
          >
            {foodTypes.map((category) => (
              <option value={category.id} key={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <label className="mt-3" htmlFor="food-image">
            Image
          </label>
          {img && (
            <img
              className="d-block mb-2 img-fluid"
              src={imageUrl(img)}
              alt={name || "Current food"}
              width="100"
            />
          )}
          <input
            ref={fileInputRef}
            id="food-image"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="form-control"
            onChange={(event) =>
              setSelectedFile(event.target.files?.[0] ?? null)
            }
          />
          <label className="mt-3" htmlFor="food-name">
            Name
          </label>
          <input
            id="food-name"
            required
            maxLength={120}
            className="form-control"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <label className="mt-3" htmlFor="food-remark">
            Remark
          </label>
          <input
            id="food-remark"
            maxLength={500}
            className="form-control"
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
          />
          <label className="mt-3" htmlFor="food-price">
            Price
          </label>
          <input
            id="food-price"
            type="number"
            min="0"
            step="1"
            required
            className="form-control"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
          <fieldset className="mt-3">
            <legend className="fs-6">Food kind</legend>
            <label className="me-3">
              <input
                type="radio"
                name="foodType"
                value="food"
                checked={foodType === "food"}
                onChange={() => setFoodType("food")}
              />{" "}
              อาหาร
            </label>
            <label>
              <input
                type="radio"
                name="foodType"
                value="drink"
                checked={foodType === "drink"}
                onChange={() => setFoodType("drink")}
              />{" "}
              เครื่องดื่ม
            </label>
          </fieldset>
          <button
            className="btn btn-primary mt-3"
            type="submit"
            disabled={isSaving || !foodTypeId}
          >
            <i className="fas fa-check me-2" />
            {isSaving ? "Saving…" : "Save"}
          </button>
        </form>
      </MyModal>
    </>
  );
}
