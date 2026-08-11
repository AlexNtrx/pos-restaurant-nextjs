"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import api from "@/lib/api";
import MyModal from "../components/mymodal";

type UserLevel = "admin" | "user";

type User = {
  id: number;
  name: string;
  username: string;
  level: UserLevel;
};

const userLevels: UserLevel[] = ["admin", "user"];

// Validates is user before it is used.
const isUser = (value: unknown): value is User => {
  if (!value || typeof value !== "object") return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.id === "number" &&
    typeof user.name === "string" &&
    typeof user.username === "string" &&
    (user.level === "admin" || user.level === "user")
  );
};

// Loads error message for the current workflow.
const getErrorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Unable to complete the user request";

// Renders the user management page interface.
export default function UserPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [id, setId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [levelSelected, setLevelSelected] = useState<UserLevel>("admin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [currentUserId] = useState<number | null>(() => {
    const storedId = Number(localStorage.getItem("next_user_id"));
    return Number.isInteger(storedId) && storedId > 0 ? storedId : null;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.get("/user/list");
      const results = response.data?.results;
      if (!Array.isArray(results) || !results.every(isUser)) {
        throw new Error("Invalid user-list response");
      }
      setUsers(results);
    } catch (error: unknown) {
      await Swal.fire({
        title: "Error",
        text: getErrorMessage(error),
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
    setLevelSelected("admin");
    setUsername("");
    setPassword("");
  };

  // Handles edit events and preserves existing side effects.
  const handleEdit = (user: User) => {
    setId(user.id);
    setName(user.name);
    setLevelSelected(user.level);
    setUsername(user.username);
    setPassword("");
  };

  // Handles save events and preserves existing side effects.
  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedUsername = username.trim();
    const isCreating = id === null;

    if (!trimmedName || !trimmedUsername) {
      await Swal.fire({
        title: "Validation",
        text: "Name and username are required",
        icon: "warning",
      });
      return;
    }
    if (
      (isCreating && password.length < 8) ||
      (!isCreating && password && password.length < 8)
    ) {
      await Swal.fire({
        title: "Validation",
        text: "Password must be at least 8 characters",
        icon: "warning",
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: trimmedName,
        level: levelSelected,
        username: trimmedUsername,
        ...(password ? { password } : {}),
      };

      if (isCreating) {
        await api.post("/user/create", payload);
      } else {
        await api.put("/user/update", { ...payload, id });
      }

      await fetchData();
      document.getElementById("modalUser_btnClose")?.click();
      clearForm();
    } catch (error: unknown) {
      await Swal.fire({
        title: "Error",
        text: getErrorMessage(error),
        icon: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handles delete events and preserves existing side effects.
  const handleDelete = async (user: User) => {
    const confirmation = await Swal.fire({
      icon: "warning",
      title: "Confirm deletion",
      text: `Delete ${user.username}? This disables the account.`,
      showCancelButton: true,
      confirmButtonText: "Delete",
    });
    if (!confirmation.isConfirmed) return;

    try {
      await api.delete(`/user/remove/${user.id}`);
      await fetchData();
    } catch (error: unknown) {
      await Swal.fire({
        title: "Error",
        text: getErrorMessage(error),
        icon: "error",
      });
    }
  };

  return (
    <>
      <div className="card mt-3">
        <div className="card-header">
          <h3 className="card-title">Staff Accounts</h3>
        </div>
        <div className="card-body">
          <button
            className="btn btn-primary mb-3"
            data-bs-toggle="modal"
            data-bs-target="#modalUser"
            onClick={clearForm}
          >
            <i className="fas fa-plus me-2" />
            Add Staff Account
          </button>
          <table className="table table-bordered">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th style={{ width: "110px" }} />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="text-center">
                    Loading users…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center">
                    No active users
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.username}</td>
                    <td>{user.level}</td>
                    <td className="text-center">
                      <button
                        className="btn btn-primary me-2"
                        data-bs-toggle="modal"
                        data-bs-target="#modalUser"
                        onClick={() => handleEdit(user)}
                        aria-label={`Edit ${user.username}`}
                      >
                        <i className="fas fa-edit" />
                      </button>
                      {currentUserId !== user.id && (
                        <button
                          className="btn btn-danger"
                          onClick={() => void handleDelete(user)}
                          aria-label={`Delete ${user.username}`}
                        >
                          <i className="fas fa-trash" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <MyModal
        id="modalUser"
        title={id === null ? "Add Staff Account" : "Edit Staff Account"}
      >
        <form onSubmit={handleSave}>
          <label htmlFor="user-name">Name</label>
          <input
            id="user-name"
            required
            maxLength={100}
            className="form-control"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <label className="mt-3" htmlFor="user-role">
            Role
          </label>
          <select
            id="user-role"
            className="form-control"
            value={levelSelected}
            onChange={(event) =>
              setLevelSelected(event.target.value as UserLevel)
            }
          >
            {userLevels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
          <label className="mt-3" htmlFor="user-username">
            Username
          </label>
          <input
            id="user-username"
            required
            maxLength={64}
            autoComplete="username"
            className="form-control"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <label className="mt-3" htmlFor="user-password">
            Password
          </label>
          <input
            id="user-password"
            type="password"
            required={id === null}
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            placeholder={
              id === null
                ? "At least 8 characters"
                : "Leave blank to keep unchanged"
            }
            className="form-control"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            className="btn btn-primary mt-3"
            type="submit"
            disabled={isSaving}
          >
            <i className="fas fa-check me-2" />
            {isSaving ? "Saving…" : "Save"}
          </button>
        </form>
      </MyModal>
    </>
  );
}
