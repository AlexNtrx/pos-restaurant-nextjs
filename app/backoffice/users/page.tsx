"use client";
import { useEffect, useState } from "react";
import config from "@/app/config";
import Swal from "sweetalert2";
import api from "@/lib/api";
import MyModal from "../components/mymodal";

export default function UserPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [id, setId] = useState<number>(0);
  const [name, setName] = useState<string>("");
  const [level, setLevel] = useState<string[]>(["admin", "user"]);
  const [levelSelected, setLevelSelected] = useState<string>("admin");
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<number>(0);

  useEffect(() => {
    setCurrentUserId(parseInt(localStorage.getItem("next_user_id") || "0"));
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await api.get(`/user/list`);
      setUsers(res.data.results);
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  const handleSave = async () => {
    try {
      const payload = {
        name: name,
        level: levelSelected,
        username: username,
        password: password,
        id: id,
      };

      if (id === 0) {
        await api.post(`/user/create`, payload);
      } else {
        await api.put(`/user/update`, payload);
        setId(0);
      }
      fetchData();

      document.getElementById(`modalUser_btnClose`)?.click();
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  const handleClearForm = () => {
    setId(0);
    setName("");
    setLevelSelected("admin");
    setUsername("");
    setPassword("");
  };
  const handleEdit = (id: number) => {
    setId(id);

    const user = users.find((item) => item.id === id);
    setName(user.name);
    setLevelSelected(user.level);
    setUsername(user.username);
     setPassword(user.password ?? "");
  };

  const handleDelete = async (id: number) => {
    try {
      const button = await Swal.fire({
        icon: "warning",
        title: "Confirm",
        text: "Do you want to delete?",
        showCancelButton: true,
      });

      if (button.isConfirmed) {
        await api.delete(`/user/remove/${id}`);
        fetchData();
      }
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  return (
    <>
      <div className="card mt-3">
        <div className="card-header">
          <h3 className="card-title">User</h3>
        </div>
        <div className="card-body">
          <button
            className="btn btn-primary mb-3"
            data-bs-toggle="modal"
            data-bs-target="#modalUser"
            onClick={handleClearForm}
          >
            <i className="fas fa-plus"></i>
            add
          </button>
          <table className="table table-bordered">
            <thead>
              <tr>
                <th>Name</th>
                <th>username</th>
                <th>role</th>
                <th style={{ width: "110px" }}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((item, index) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.username}</td>
                  <td>{item.level}</td>
                  <td className="text-center">
                    {currentUserId !== item.id ? (
                      <>
                        <button
                          className="btn btn-primary me-2"
                          data-bs-toggle="modal"
                          data-bs-target="#modalUser"
                          onClick={() => handleEdit(item.id)}
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => handleDelete(item.id)}
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <MyModal id="modalUser" title="user">
        <div>name</div>
        <input
          type="text"
          className="form-control"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="mt-3">role</div>
        <select
          className="form-control"
          value={levelSelected}
          onChange={(e) => setLevelSelected(e.target.value)}
        >
          {level.map((item, index) => (
            <option key={index} value={item}>
              {item}
            </option>
          ))}
        </select>
        <div className="mt-3">username</div>
        <input
          type="text"
          className="form-control"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <div className="mt-3">Password</div>
        <input
          type="text"
          className="form-control"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn btn-primary mt-3" onClick={handleSave}>
          <i className="fas fa-check me-2"></i>
          Save
        </button>
      </MyModal>
    </>
  );
}
