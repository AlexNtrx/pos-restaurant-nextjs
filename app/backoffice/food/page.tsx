"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import config from "@/app/config";
import MyModal from "../components/mymodal";

export default function Page() {
  const [foodTypeId, setFoodTypeId] = useState(0);
  const [foodTypes, setFoodTypes] = useState([]);
  const [foods, setFoods] = useState([]);
  const [name, setName] = useState("");
  const [remark, setRemark] = useState("");
  const [id, setId] = useState(0);
  const [price, setPrice] = useState(0);
  const [img, setImg] = useState("");
  const [myFile, setMyFile] = useState<File | null>(null);
  const [foodType, setFoodType] = useState("food");

  useEffect(() => {
    fetchDataFoodTypes();
    fetchData();
  }, []);
  const fetchData = async () => {
    try {
      const res = await axios.get(config.apiServer + "/api/food/list");
      setFoods(res.data.results);
    } catch (e: any) {
      Swal.fire({
        icon: "error",
        title: "error",
        text: e.message,
      });
    }
  };
  const fetchDataFoodTypes = async () => {
    try {
      const res = await axios.get(config.apiServer + "/api/foodType/list");

      if (res.data.results.length > 0) {
        setFoodTypes(res.data.results);
        setFoodTypeId(res.data.results[0].id);
      }
    } catch (e: any) {
      Swal.fire({
        icon: "error",
        title: "error",
        text: e.message,
      });
    }
  };
  const handleSelectedFile = (e: any) => {
    if (e.target.files.length > 0) {
      setMyFile(e.target.files[0]);
    }
  };
  const handleSave = async () => {
    try {
      const img = await handleUpload();
      const payload = {
        foodTypeId: foodTypeId,
        name: name,
        remark: remark,
        price: price,
        img: img,
        id: id === 0 ? undefined : id,
        foodType: foodType,
      };
      if (id == 0) {
        const res = await axios.post(
          config.apiServer + "/api/food/create",
          payload,
        );
      } else {
        const res = await axios.put(
          config.apiServer + "/api/food/update",
          payload,
        );
        setId(0);
      }

      Swal.fire({
        icon: "success",
        title: 'saving',
        text: "save success",
        timer: 1000,
      });
      fetchData();
      document.getElementById("modalFood_btnClose")?.click();
    } catch (e: any) {
      Swal.fire({
        icon: "error",
        title: "error",
        text: e.message,
      });
    }
  };
  const handleUpload = async () => {
    try {
      const formData = new FormData();
      formData.append("file", myFile as Blob);

      const res = await axios.post(
        config.apiServer + "/api/food/upload",
        formData,
      );
      return res.data.fileName;
    } catch (e: any) {
      Swal.fire({
        icon: "error",
        title: "error",
        text: e.message,
      });
      throw e;
    }
  };
  const getFoodTypeName = (foodType: string): string => {
    if (foodType == "food") {
      return "อาหาร";
    } else {
      return "เครื่องดื่ม";
    }
  };
  const handleRemove = async (id: number) => {
    try {
      const button = await Swal.fire({
        title: "ยืนยันการลบ",
        text: "คุณต้องการลบใช่หรือไม่",
        icon: "question",
        showCancelButton: true,
        showConfirmButton: true,
      });
      if (button.isConfirmed) {
        await axios.delete(config.apiServer + "/api/food/remove/" + id);
        fetchData();
      }
    } catch (e: any) {
      Swal.fire({
        title: "error",
        icon: "error",
        text: e.message,
      });
    }
  };
  const edit = (item: any) => {
    setId(item.id);
    setFoodTypeId(item.foodTypeId);
    setName(item.name);
    setRemark(item.remark);
    setPrice(item.price);
    setFoodType(item.foodType);
    setImg(item.img);
  };
  const clearForm = () => {
    setId(0);
    setName("");
    setRemark("");
    setPrice(0);
    setFoodType("food");
    setImg("");
    document.getElementById("myFile")?.setAttribute("value", "");
  }
  return (
    <>
      <div className="mt-3 card">
        <div className="card-header">food</div>
        <div className="card-body">
          <button
            className="btn btn-primary"
            data-bs-toggle="modal"
            data-bs-target="#modalFood"
            onClick={(e) => clearForm()}
          >
            <i className="fa fa-plus me-2"></i>add
          </button>
          <table className="mt-3 table table-bordered table-striped">
            <thead>
              <tr>
                <th style={{ width: "100px" }}>ภาพ</th>
                <th style={{ width: "200x" }}>ประเภทอาหาร</th>
                <th style={{ width: "100px" }}>ชนิด</th>
                <th style={{ width: "200px" }}>ชื่อ</th>
                <th>หมายเหตุ</th>
                <th style={{ width: "100px" }} className="text-end">
                  ราคา
                </th>
                <th style={{ width: "110px" }}></th>
              </tr>
            </thead>
            <tbody>
              {foods.map((item: any) => (
                <tr key={item.id}>
                  <td>
                    <img
                      src={config.apiServer + "/uploads/" + item.img}
                      alt={item.name}
                      width="100"
                    />
                  </td>
                  <td>{item.FoodType.name}</td>
                  <td>{getFoodTypeName(item.foodType)}</td>
                  <td>{item.name}</td>
                  <td>{remark}</td>
                  <td>{item.price}</td>
                  <td>
                    <button
                      className="btn btn-primary me2"
                      data-bs-toggle="modal"
                      data-bs-target="#modalFood"
                      onClick={(e) => edit(item)}
                    >
                      <i className="fa fa-edit"></i>
                    </button>
                    <button
                      className="btn btn-danger me-2"
                      onClick={(e) => handleRemove(item.id)}
                    >
                      <i className="fa fa-times"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <MyModal id="modalFood" title="อาหาร">
        <div>foodtype</div>
        <select
          className="form-select"
          onChange={(e) => setFoodTypeId(parseInt(e.target.value))}
        >
          {foodTypes.map((item: any) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <div className="mt-3">Picture</div>
        {img != "" && (
          <img
            className="mb-2 img-fluid"
            src={config.apiServer + "/uploads/" + img}
            alt={name}
            width="100"
          ></img>
        )}
        <input
        id="myFile"
          type="file"
          className="form-control"
          onChange={(e) => handleSelectedFile(e)}
        />
        <div className="mt-3">Name</div>
        <input
          type="text"
          className="form-control"
          onChange={(e) => setName(e.target.value)}
          value={name}
        />
        <div className="mt-3">Remark</div>
        <input
          type="text"
          className="form-control"
          onChange={(e) => setRemark(e.target.value)}
          value={remark}
        />
        <div className="mt-3">Price</div>
        <input
          type="text"
          className="form-control"
        onChange={(e) => setPrice(parseInt(e.target.value) || 0)}
          value={price}
        />
        <div className="mt-3">ประเภทอาหาร </div>
        <div className="mt-1">
          <input
            type="radio"
            name="foodType"
            id=""
            value="food"
            checked={foodType == "food"}
            onChange={(e) => setFoodType(e.target.value)}
          />
          อาหาร
          <input
            type="radio"
            name="foodType"
            className="ms-2"
            id=""
            value="drink"
            checked={foodType == "drink"}
            onChange={(e) => setFoodType(e.target.value)}
          />
          เครื่องดื่ม
        </div>

        <button className="btn btn-primary mt-3" onClick={handleSave}>
          <i className="fas fa-check me-2"></i>
        </button>
      </MyModal>
    </>
  );
}
