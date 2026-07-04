"use client";

import { useEffect, useState, useRef } from "react";
import config from "@/app/config";
import Swal from "sweetalert2";
import axios from "axios";

export default function Page() {
  const [table, setTable] = useState("");
  const [foods, setFoods] = useState([]);
  const [saleTempDetails, setSaleTempDetails] = useState([]);
  const myRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getFoods();
    fetchDataSaleTemp();
    (myRef.current as HTMLInputElement).focus();
  }, []);

  const getFoods = async () => {
    try {
      const res = await axios.get(config.apiServer + "/api/food/list");
      setFoods(res.data.results);
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  const filterFood = async (foodType: string) => {
    try {
      const res = await axios.get(
        ` ${config.apiServer}/api/food/filter/${foodType}`,
      );
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  const fetchDataSaleTemp = async () => {
    try {
     const res = await axios.get(config.apiServer + "/api/saleTemp/list"
      );
      setSaleTempDetails(res.data.results[0].saleTempDetails);
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  const sale = async (foodId: number) => {
    try {
      const payload = {
        tableNo: table,
        userId: Number(localStorage.getItem("next_user_id")),
        foodId: foodId,
      };
      await axios.post(config.apiServer + "/api/saleTemp/create", payload);
      fetchDataSaleTemp();
    } catch (e: any) {
      console.log(e);
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
        <div className="card-header">Sale </div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-3">
              <div className="input-group">
                <div className="input-group-text">Table </div>
                <input
                  type="text"
                  className="form-control"
                  value={table}
                  onChange={(e) => setTable(Number(e.target.value))}
                  ref={myRef}
                />
              </div>
            </div>

            <div className="col-md-9">
              <button
                className="btn btn-primary me-1"
                onClick={() => filterFood("food")}
              >
                <i className="fa fa-hamburger me-2"></i>food
              </button>
              <button
                className="btn btn-primary me-1"
                onClick={() => filterFood("drink")}
              >
                <i className="fa fa-coffee me-2"></i>
                Drinks
              </button>
              <button
                className="btn btn-primary me-1"
                onClick={() => filterFood("all")}
              >
                <i className="fa fa-list me-2"></i>
                Total
              </button>
              <button className="btn btn-danger">
                <i className="fa fa-times me-2"></i>
                Clear
              </button>
            </div>
          </div>
          <div className="row mt-3">
            <div className="col-md-9">
              <div className="row g-1">
                {foods.map((food: any) => (
                  <div
                    className="col-md-3 col-lg-3 col-sm-4 col-6"
                    key={food.id}
                  >
                    <div className="card">
                      <img
                        src={config.apiServer + "/uploads/" + food.img}
                        alt={food.name}
                        className="img-fluid"
                        style={{ height: "200px", objectFit: "cover" }}
                        onClick={(e) => sale(food.id)}
                      />
                      <div className="card-body">
                        <h5>{food.name}</h5>
                        <p className="fw-bold text-success h4">
                          {food.price} €
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="col-md-3">
              <div className="alert p-3 text-end h1 text-white bg-dark">
                0.00
              </div>
              {saleTempDetails.map((item: any) => (
                <div className="d-grid mt-2" key={item.id}>
                  <div className="card">
                    <div className="card-body">
                      <div className="fw-bold">{item.Food.name}</div>
                      <div> {item.Food.price} x 1 = {item.Food.price * 1}</div>
                    </div>
                    <div className="mt-1">
                      <div className="input-group">
                        <button className="input-group-text btn btn-primary">
                          <i className="fa fa-minus"></i>
                        </button>
                        <input type="text" className="form-control text-center fw-bold" value="1" disabled />
                        <button className="input-group-text btn btn-primary">
                          <i className="fa fa-plus"></i>
                        </button>
                      </div>
                    </div>
                    <div className="card-footer p-1">
                      <div className="row g-1">
                        <div className="col-md-6">
                          <button className="btn btn-danger btn-blocker">
                            <i className="fa fa-times me-2"></i>
                            Cancel
                          </button>
                        </div>
                        <div className="col-md-6">
                          <button className="btn btn-success btn-block">
                            <i className="fa fa-cog me-2"></i>
                            edit
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
