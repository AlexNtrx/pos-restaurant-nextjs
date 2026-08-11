"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import api from "@/lib/api";
import MyModal from "../components/mymodal";

type FoodType = { id: number; name: string; remark: string };
type FoodSize = {
  id: number;
  name: string;
  remark: string;
  foodTypeId: number;
  moneyAdded: number;
  FoodType: FoodType;
};

// Validates is food type before it is used.
const isFoodType = (value: unknown): value is FoodType => {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "number" &&
    typeof item.name === "string" &&
    typeof item.remark === "string"
  );
};
// Validates is food size before it is used.
const isFoodSize = (value: unknown): value is FoodSize => {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "number" &&
    typeof item.name === "string" &&
    typeof item.remark === "string" &&
    typeof item.foodTypeId === "number" &&
    typeof item.moneyAdded === "number" &&
    isFoodType(item.FoodType)
  );
};
// Coordinates error message behavior for this module.
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Unable to complete the size request";

// Renders the food size page interface.
export default function FoodSizePage() {
  const [name, setName] = useState("");
  const [remark, setRemark] = useState("");
  const [id, setId] = useState<number | null>(null);
  const [foodTypeId, setFoodTypeId] = useState<number | null>(null);
  const [moneyAdded, setMoneyAdded] = useState("0");
  const [foodTypes, setFoodTypes] = useState<FoodType[]>([]);
  const [foodSizes, setFoodSizes] = useState<FoodSize[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [sizeResponse, categoryResponse] = await Promise.all([
        api.get("/foodSize/list"),
        api.get("/foodType/list"),
      ]);
      if (
        !Array.isArray(sizeResponse.data?.results) ||
        !sizeResponse.data.results.every(isFoodSize) ||
        !Array.isArray(categoryResponse.data?.results) ||
        !categoryResponse.data.results.every(isFoodType)
      ) {
        throw new Error("Invalid food-size response");
      }
      setFoodSizes(sizeResponse.data.results);
      setFoodTypes(categoryResponse.data.results);
      setFoodTypeId(
        (current) => current ?? categoryResponse.data.results[0]?.id ?? null,
      );
    } catch (error: unknown) {
      await Swal.fire({
        title: "Error",
        icon: "error",
        text: errorMessage(error),
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
    setMoneyAdded("0");
    setFoodTypeId(foodTypes[0]?.id ?? null);
  };
  // Coordinates edit behavior for this module.
  const edit = (size: FoodSize) => {
    setId(size.id);
    setName(size.name);
    setRemark(size.remark);
    setFoodTypeId(size.foodTypeId);
    setMoneyAdded(String(size.moneyAdded));
  };
  // Coordinates save behavior for this module.
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedRemark = remark.trim();
    const amount = Number(moneyAdded);
    if (
      !foodTypeId ||
      !normalizedName ||
      !Number.isInteger(amount) ||
      amount < 0
    ) {
      await Swal.fire({
        title: "Validation",
        text: "Category, name, and a whole non-negative amount are required",
        icon: "warning",
      });
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        foodTypeId,
        name: normalizedName,
        remark: normalizedRemark,
        moneyAdded: amount,
      };
      if (id === null) await api.post("/foodSize/create", payload);
      else await api.put("/foodSize/update", { ...payload, id });
      await fetchData();
      document.getElementById("modalFoodSize_btnClose")?.click();
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
  // Removes or clears  using the existing workflow.
  const remove = async (size: FoodSize) => {
    const confirmation = await Swal.fire({
      title: "ยืนยันการลบ",
      text: `ลบขนาด ${size.name} หรือไม่?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "ลบ",
    });
    if (!confirmation.isConfirmed) return;
    try {
      await api.delete(`/foodSize/remove/${size.id}`);
      await fetchData();
    } catch (error: unknown) {
      await Swal.fire({
        title: "Error",
        icon: "error",
        text: errorMessage(error),
      });
    }
  };

  return (
    <>
      <div className="card mt-3">
        <div className="card-header">Size Options</div>
        <div className="card-body">
          <button
            className="btn btn-primary"
            data-bs-toggle="modal"
            data-bs-target="#modalFoodSize"
            onClick={clearForm}
            disabled={foodTypes.length === 0}
          >
            <i className="fa fa-plus me-2" />
            Add Size Option
          </button>
          {foodTypes.length === 0 && !isLoading && (
            <p className="mt-2 mb-0 text-danger">
              Create an active food category before adding a size.
            </p>
          )}
          <table className="mt-3 table table-bordered table-striped">
            <thead>
              <tr>
                <th>ประเภทอาหาร</th>
                <th>ชื่อ</th>
                <th>หมายเหตุ</th>
                <th className="text-end">คิดเงินเพิ่ม</th>
                <th style={{ width: "110px" }} />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center">
                    Loading sizes…
                  </td>
                </tr>
              ) : foodSizes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center">
                    No active sizes
                  </td>
                </tr>
              ) : (
                foodSizes.map((size) => (
                  <tr key={size.id}>
                    <td>{size.FoodType.name}</td>
                    <td>{size.name}</td>
                    <td>{size.remark}</td>
                    <td className="text-end">{size.moneyAdded}</td>
                    <td>
                      <button
                        className="btn btn-primary me-2"
                        data-bs-toggle="modal"
                        data-bs-target="#modalFoodSize"
                        onClick={() => edit(size)}
                        aria-label={`Edit ${size.name}`}
                      >
                        <i className="fa fa-edit" />
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => void remove(size)}
                        aria-label={`Delete ${size.name}`}
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
        id="modalFoodSize"
        title={id === null ? "Add Size Option" : "Edit Size Option"}
      >
        <form onSubmit={save}>
          <label htmlFor="size-category">ประเภท</label>
          <select
            id="size-category"
            className="form-control"
            value={foodTypeId ?? ""}
            onChange={(event) => setFoodTypeId(Number(event.target.value))}
            required
          >
            {foodTypes.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <label className="mt-3" htmlFor="size-name">
            ชื่อ
          </label>
          <input
            id="size-name"
            className="form-control"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <label className="mt-3" htmlFor="size-money">
            คิดเงินเพิ่ม (บาท)
          </label>
          <input
            id="size-money"
            className="form-control"
            value={moneyAdded}
            type="number"
            min="0"
            step="1"
            required
            onChange={(event) => setMoneyAdded(event.target.value)}
          />
          <label className="mt-3" htmlFor="size-remark">
            หมายเหตุ
          </label>
          <input
            id="size-remark"
            className="form-control"
            maxLength={500}
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
          />
          <button
            className="mt-3 btn btn-primary"
            type="submit"
            disabled={isSaving || !foodTypeId}
          >
            <i className="fa fa-save me-2" />
            {isSaving ? "Saving…" : "บันทึก"}
          </button>
        </form>
      </MyModal>
    </>
  );
}
