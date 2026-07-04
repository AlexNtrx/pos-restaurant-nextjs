"use client";

import { useEffect, useState } from "react";
import config from "@/app/config";
import Swal from "sweetalert2";
import axios from "axios";

export default function Page() {
  const [table, setTable] = useState("");
  const [foods, setFoods] = useState([]);

  useEffect(() => {
    getFoods();
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
                />
              </div>
            </div>

            <div className="col-md-9">
              <button className="btn btn-primary me-1">
                <i className="fa fa-hamburger me-2"></i>food
              </button>
              <button className="btn btn-primary me-1">
                <i className="fa fa-coffee me-2"></i>
                Drinks
              </button>
              <button className="btn btn-primary me-1">
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
                      />
                      <div className="card-body">
                        <h5>{food.name}</h5>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
