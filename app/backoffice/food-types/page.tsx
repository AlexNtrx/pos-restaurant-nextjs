"use client";

import { useEffect, useState } from "react";
import Mymodal from "../components/mymodal";
import Swal from "sweetalert2";
import api from "@/lib/api";

export default function Page() {
  const [id, setId] = useState(0);
  const [name, setName] = useState("");
  const [remark, setRemark] = useState("");
  const [foodTypes, setFoodTypes] = useState([]);
  useEffect(() => {
    fetchData();
  }, []);
  const handleSave = async () => {
    try {
      const payload = {
        name: name,
        remark: remark,
        id: id,
      };
      if (id == 0) {
        await api.post("foodType/create", payload);
      } else {
        await api.put("/foodType/update", payload);
        setId(0);
      }

      fetchData();
      document.getElementById("modalFoodType_btnClose")?.click();
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: "e.message",
        icon: "error",
      });
    }
  };
  const fetchData = async () => {
    try {
      const res = await api.get("/foodType/list");
      setFoodTypes(res.data.results);
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  const handleRemove = async (item: any) => {
    try {
      const button = await Swal.fire({
        title: "ยืนยันการลบ",
        text: "คุณต้องการลบใช่หรือไม่",
        icon: "question",
        showCancelButton: true,
        showConfirmButton: true,
      });
      if (button.isConfirmed) {
        await api.delete("/foodType/remove/" + item.id);
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
  const edit = (item: any) => {
    setId(item.id);
    setName(item.name);
    setRemark(item.remark);
  };
  const clearForm = () => {
    setName("");
    setRemark("");
    setId(0);
  };
  return (
    <>
      <div className="card mt-3">
        <div className="card-header">ประเภทอาหาร/เครื่องดื่ม</div>
        <div className="card-body">
          <button
            className="btn btn-primary"
            data-bs-toggle="modal"
            data-bs-target="#modalFoodType"
            onClick={clearForm}
          >
            <i className="fa fa-plus me-2"> </i>เพิ่มรายการ
          </button>
          <table className="mt-3 table table-bordered table-striped">
            <thead>
              <tr>
                <th style={{ width: "200px" }}>ชื่อ</th>
                <th>หมายเหตุ</th>
                <th style={{ width: "110px" }}></th>
              </tr>
            </thead>
            <tbody>
              {foodTypes.map((item: any) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.remark}</td>
                  <td className="text-center">
                    <button
                      className="btn btn-primary me2"
                      data-bs-toggle="modal"
                      data-bs-target="#modalFoodType"
                      onClick={(e) => edit(item)}
                    >
                      <i className="fa fa-edit"></i>
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={(e) => handleRemove(item)}
                    >
                      <i className="fa fa-times"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Mymodal id="modalFoodType" title="ประเภทอาหาร/เครื่องดื่ม">
          <div>ชื่อ</div>
          <input
            className="form-control"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="mt-3">หมายเหตุ</div>
          <input
            className="form-control"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />

          <div className="mt-3">
            <button className="btn btn-primary" onClick={handleSave}>
              <i className="fa fa-check me-2"></i>บันทึก
            </button>
          </div>
        </Mymodal>
      </div>
    </>
  );
}
