"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import api from "@/lib/api";
import MyModal from "../components/mymodal";
type FoodType = { id: number; name: string; remark: string };
type Taste = {
  id: number;
  name: string;
  remark: string;
  foodTypeId: number;
  FoodType: FoodType;
};
// Validates is food type before it is used.
const isFoodType = (v: unknown): v is FoodType =>
  !!v &&
  typeof v === "object" &&
  typeof (v as FoodType).id === "number" &&
  typeof (v as FoodType).name === "string" &&
  typeof (v as FoodType).remark === "string";
// Validates is taste before it is used.
const isTaste = (v: unknown): v is Taste =>
  !!v &&
  typeof v === "object" &&
  typeof (v as Taste).id === "number" &&
  typeof (v as Taste).name === "string" &&
  isFoodType((v as Taste).FoodType);
// Coordinates error message behavior for this module.
const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "Unable to complete the modifier request";
// Renders the taste management page interface.
export default function TastePage() {
  const [foodTypes, setFoodTypes] = useState<FoodType[]>([]),
    [foodTypeId, setFoodTypeId] = useState<number | null>(null),
    [name, setName] = useState(""),
    [remark, setRemark] = useState(""),
    [tastes, setTastes] = useState<Taste[]>([]),
    [id, setId] = useState<number | null>(null),
    [isLoading, setIsLoading] = useState(true),
    [isSaving, setIsSaving] = useState(false);
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [a, b] = await Promise.all([
        api.get("/taste/list"),
        api.get("/foodType/list"),
      ]);
      if (
        !Array.isArray(a.data?.results) ||
        !a.data.results.every(isTaste) ||
        !Array.isArray(b.data?.results) ||
        !b.data.results.every(isFoodType)
      )
        throw new Error("Unable to load modifiers");
      setTastes(a.data.results);
      setFoodTypes(b.data.results);
      setFoodTypeId((x) => x ?? b.data.results[0]?.id ?? null);
    } catch (e) {
      await Swal.fire({ title: "Error", icon: "error", text: errorMessage(e) });
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => void fetchData(), 0);
    return () => window.clearTimeout(t);
  }, [fetchData]);
  // Removes or clears  using the existing workflow.
  const clear = () => {
    setId(null);
    setName("");
    setRemark("");
    setFoodTypeId(foodTypes[0]?.id ?? null);
  };
  // Coordinates save behavior for this module.
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!foodTypeId || !name.trim()) {
      await Swal.fire({
        title: "Check your details",
        text: "Menu category and modifier name are required.",
        icon: "warning",
      });
      return;
    }
    setIsSaving(true);
    try {
      const p = { foodTypeId, name: name.trim(), remark: remark.trim() };
      if (id === null) await api.post("/taste/create", p);
      else await api.put("/taste/update", { ...p, id });
      await fetchData();
      document.getElementById("modalTaste_btnClose")?.click();
      clear();
    } catch (e) {
      await Swal.fire({ title: "Error", icon: "error", text: errorMessage(e) });
    } finally {
      setIsSaving(false);
    }
  };
  // Removes or clears  using the existing workflow.
  const remove = async (t: Taste) => {
    const c = await Swal.fire({
      title: "Delete modifier?",
      text: `Delete ${t.name}? This cannot be undone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
    });
    if (c.isConfirmed) {
      try {
        await api.delete(`/taste/remove/${t.id}`);
        await fetchData();
      } catch (e) {
        await Swal.fire({
          title: "Error",
          icon: "error",
          text: errorMessage(e),
        });
      }
    }
  };
  return (
    <div className="card mt-3">
      <div className="card-header">Modifiers</div>
      <div className="card-body">
        <button
          className="btn btn-primary"
          data-bs-toggle="modal"
          data-bs-target="#modalTaste"
          onClick={clear}
          disabled={!foodTypes.length}
        >
          <i className="fa fa-plus me-2" />
          Add Modifier
        </button>
        {!foodTypes.length && !isLoading && (
          <p className="mt-2 text-danger">
            Create an active menu category before adding a modifier.
          </p>
        )}
        <table className="mt-3 table table-bordered table-striped">
          <thead>
            <tr>
              <th>Menu Category</th>
              <th>Name</th>
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4}>Loading modifiers…</td>
              </tr>
            ) : tastes.length === 0 ? (
              <tr>
                <td colSpan={4}>No active modifiers</td>
              </tr>
            ) : (
              tastes.map((t) => (
                <tr key={t.id}>
                  <td>{t.FoodType.name}</td>
                  <td>{t.name}</td>
                  <td>{t.remark}</td>
                  <td>
                    <button
                      className="btn btn-primary me-2"
                      data-bs-toggle="modal"
                      data-bs-target="#modalTaste"
                      onClick={() => {
                        setId(t.id);
                        setName(t.name);
                        setRemark(t.remark);
                        setFoodTypeId(t.foodTypeId);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => void remove(t)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <MyModal
          id="modalTaste"
          title={id === null ? "Add Modifier" : "Edit Modifier"}
        >
          <form onSubmit={save}>
            <label>Menu Category</label>
            <select
              className="form-control"
              value={foodTypeId ?? ""}
              onChange={(e) => setFoodTypeId(Number(e.target.value))}
            >
              {foodTypes.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <label className="mt-3">Name</label>
            <input
              className="form-control"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <label className="mt-3">Notes</label>
            <input
              className="form-control"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
            />
            <button className="mt-3 btn btn-primary" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save"}
            </button>
          </form>
        </MyModal>
      </div>
    </div>
  );
}
