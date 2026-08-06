"use client";

import { use, useEffect, useState } from "react";
import Mymodal from "../components/mymodal";
import Swal from "sweetalert2";
import api from "@/lib/api";

export default function FoodPaginate() {
  const [foods, setFoods] = useState([]);
  const [totalPage, setTotalPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(2);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (page: number = 1) => {
    try {
      const payload = {
        page: page,
        itemsPerPage: itemsPerPage,
      };
      const res = await api.post("/food/paginate", payload);
      setFoods(res.data.results);
      setTotalPage(res.data.totalPages);
      setTotalItems(res.data.totalItems);
    } catch (error: any) {
      Swal.fire({
        icon: "error",
        title: "error",
        text: error.message,
      });
    }
  };

  const changePage = (page: number) => {
    if (page > 0 && page <= totalPage) {
      setCurrentPage(page);
      fetchData(page);
    }
  };
  return (
    <>
      <div className="card mt-3">
        <div className="card-header">Food list</div>
        <div className="card-body"></div>
        <table className="table table-bordered">
          <thead>
            <tr>
              <th>Name</th>
              <th className="text-end" style={{ width: "100px" }}>
                Price
              </th>
            </tr>
          </thead>
          <tbody>
            {foods.map((food: any) => (
              <tr key={food.id}>
                <td>{food.name}</td>
                <td className="text-end">{food.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2">
          <div>
            จำนวนรายการ:{totalItems} จำนวนหน้า:{totalPage}
          </div>
        </div>

        <div className="mt-2">
          <button
            className="btn btn-primary me-1"
            onClick={() => changePage(1)}
          >
            <i className="fa fa-chevron-left me-2"></i>หน้าแรก
          </button>
          <button
            className="btn btn-primary me-1"
            disabled={currentPage === 1}
            onClick={() => changePage(currentPage - 1)}
          >
            <i className="fa fa-chevron-left"></i>
          </button>
          {Array.from({ length: totalPage }, (_, index) => (
            <button
             key={index}
              className={`btn btn-primary me-1${currentPage === index + 1 ? "active" : ""}`}
              onClick={() => changePage(index + 1)}
            >
              {index + 1}
            </button>
          ))}
          <button
            disabled={currentPage === totalPage}
            className="btn btn-primary me-1"
            onClick={() => changePage(currentPage + 1)}
          >
            <i className="fa fa-chevron-right"></i>
          </button>
          <button
            disabled={currentPage === totalPage}
            className="btn btn-primary"
            onClick={() => changePage(totalPage)}
          >
            หน้าสุดท้าย
            <i className="fa fa-chevron-right ms-2"></i>
          </button>
        </div>
      </div>
    </>
  );
}
