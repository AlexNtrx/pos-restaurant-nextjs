"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import api from "@/lib/api";
import MyModal from "../components/mymodal";

type FoodType = { id: number; name: string; remark: string };

// Validates is food type before it is used.
const isFoodType = (value: unknown): value is FoodType => {
  if (!value || typeof value !== "object") return false;
  const foodType = value as Record<string, unknown>;
  return (
    typeof foodType.id === "number" &&
    typeof foodType.name === "string" &&
    typeof foodType.remark === "string"
  );
};

// Coordinates error message behavior for this module.
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : // Renders the food type page interface.
      "Unable to complete the category request";

// Renders the food type page interface.
export default function FoodTypePage() {
  const [id, setId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [remark, setRemark] = useState("");
  const [foodTypes, setFoodTypes] = useState<FoodType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.get("/foodType/list");
      if (
        !Array.isArray(response.data?.results) ||
        !response.data.results.every(isFoodType)
      ) {
        throw new Error("Invalid food-category response");
      }
      setFoodTypes(response.data.results);
    } catch (error: unknown) {
      await Swal.fire({
        title: "Error",
        text: errorMessage(error),
        icon: "error",
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
    setName("");
    setRemark("");
  };

  // Coordinates edit behavior for this module.
  const edit = (foodType: FoodType) => {
    setId(foodType.id);
    setName(foodType.name);
    setRemark(foodType.remark);
  };

  // Handles save events and preserves existing side effects.
  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedRemark = remark.trim();
    if (!normalizedName) {
      await Swal.fire({
        title: "Validation",
        text: "Category name is required",
        icon: "warning",
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = { name: normalizedName, remark: normalizedRemark };
      if (id === null) await api.post("/foodtype/create", payload);
      else await api.put("/foodtype/update", { ...payload, id });
      await fetchData();
      document.getElementById("modalFoodType_btnClose")?.click();
      clearForm();
    } catch (error: unknown) {
      await Swal.fire({
        title: "Error",
        text: errorMessage(error),
        icon: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handles remove events and preserves existing side effects.
  const handleRemove = async (foodType: FoodType) => {
    const confirmation = await Swal.fire({
      title: "Delete menu category?",
      text: `Delete ${foodType.name}? This cannot be undone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
    });
    if (!confirmation.isConfirmed) return;
    try {
      await api.delete(`/foodtype/remove/${foodType.id}`);
      await fetchData();
    } catch (error: unknown) {
      await Swal.fire({
        title: "Error",
        text: errorMessage(error),
        icon: "error",
      });
    }
  };

  return (
    <div className="card mt-3">
      <div className="card-header">Menu Categories</div>
      <div className="card-body">
        <button
          className="btn btn-primary"
          data-bs-toggle="modal"
          data-bs-target="#modalFoodType"
          onClick={clearForm}
        >
          <i className="fa fa-plus me-2" />
          Add Menu Category
        </button>
        <table className="mt-3 table table-bordered table-striped">
          <thead>
            <tr>
              <th style={{ width: "200px" }}>Name</th>
              <th>Notes</th>
              <th style={{ width: "110px" }} />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={3} className="text-center">
                  Loading categories…
                </td>
              </tr>
            ) : foodTypes.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center">
                  No active categories
                </td>
              </tr>
            ) : (
              foodTypes.map((foodType) => (
                <tr key={foodType.id}>
                  <td>{foodType.name}</td>
                  <td>{foodType.remark}</td>
                  <td className="text-center">
                    <button
                      className="btn btn-primary me-2"
                      data-bs-toggle="modal"
                      data-bs-target="#modalFoodType"
                      onClick={() => edit(foodType)}
                      aria-label={`Edit ${foodType.name}`}
                    >
                      <i className="fa fa-edit" />
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => void handleRemove(foodType)}
                      aria-label={`Delete ${foodType.name}`}
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
      <MyModal
        id="modalFoodType"
        title={id === null ? "Add Menu Category" : "Edit Menu Category"}
      >
        <form onSubmit={handleSave}>
          <label htmlFor="food-type-name">Name</label>
          <input
            id="food-type-name"
            required
            maxLength={100}
            className="form-control"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <label className="mt-3" htmlFor="food-type-remark">
            Notes
          </label>
          <input
            id="food-type-remark"
            maxLength={500}
            className="form-control"
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
          />
          <div className="mt-3">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={isSaving}
            >
              <i className="fa fa-check me-2" />
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </MyModal>
    </div>
  );
}
