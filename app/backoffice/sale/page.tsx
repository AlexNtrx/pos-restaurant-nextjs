"use client";

import { useEffect, useState, useRef } from "react";
import config from "@/app/config";
import Swal from "sweetalert2";
import api from "@/lib/api";
import MyModal from "../components/mymodal";

export default function Page() {
  const [table, setTable] = useState(1);
  const [foods, setFoods] = useState([]);
  const [saleTemps, setSaleTemps] = useState([]);
  const [amount, setAmount] = useState(0);
  const [tasted, setTasted] = useState([]);
  const [sizes, setSized] = useState(0);
  const [amountAdded, setAmountAdded] = useState(0);
  const [saleTempDetails, setSaleTempDetails] = useState([]);
  const [saleTempId, setSaleTempId] = useState(0);
  const [payType, setPayType] = useState("cash");
  const [receivedAmount, setReceivedAmount] = useState(0);
  const [billUrl, setBillUrl] = useState("");
  const myRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getFoods();
    fetchDataSaleTemp();
    (myRef.current as HTMLInputElement).focus();
  }, []);

  const sumAmount = (saleTemps: any) => {
    let sum = 0;
    saleTemps.forEach((item: any) => {
      sum += item.Food.price * item.qty;
    });
    setAmount(sum);
  };
  const getFoods = async () => {
    try {
      const res = await api.get("/food/list");
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
      const res = await api.get(` /food/filter/${foodType}`);
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
      const res = await api.get("/saleTemp/list/");
      setSaleTemps(res.data.results);
      sumAmount(res.data.results);
      const results = res.data.results;
      let sum = 0;
      results.forEach((item: any) => {
        sum += sumMoneyAdded(item.saleTempDetails);
      });
      setAmountAdded(sum);
      sumAmount(results);
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  const removeSaleTempDetail = async (id: number) => {
    console.log("Delete id =", id);
    try {
      const button = await Swal.fire({
        title: "Do you want to delete this item?",
        icon: "warning",
        showCancelButton: true,
        showConfirmButton: true,
      });
      if (button.isConfirmed) {
        await api.delete("/saleTemp/remove/" + id);
        fetchDataSaleTemp();
      }
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  const removeAllSaleTempDetail = async () => {
    try {
      const button = await Swal.fire({
        title: "Do you want to delete all items?",
        icon: "warning",
        showCancelButton: true,
        showConfirmButton: true,
      });
      if (button.isConfirmed) {
        const payload = {
          tableNo: Number(table),
          userId: Number(localStorage.getItem("next_user_id")),
        };

        await api.delete("/saleTemp/removeAll", {
          data: payload,
        });
        fetchDataSaleTemp();
      }
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
      await api.post("/saleTemp/create", payload);
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
  const updateQty = async (id: number, qty: number) => {
    try {
      const payload = {
        qty: qty,
        id: id,
      };
      await api.put("/saleTemp/updateQty", payload);
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
  const openModalEdit = (item: any) => {
    setSaleTempId(item.id);
    generateSaleTempDetail(item.id);
  };

  const fetchDataSaleTempInfo = async (saleTempId: number) => {
    try {
      const res = await api.get("/saleTemp/info/" + saleTempId);
      setSaleTempDetails(res.data.results.saleTempDetails);
      setTasted(res.data.results.Food?.FoodType?.tastes || []);
      setSized(res.data.results.Food?.FoodType?.foodSizes || []);
    } catch (e: any) {
      console.log(e);
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  const sumMoneyAdded = (saleTempDetails: any) => {
    let sum = 0;
    for (let i = 0; i < saleTempDetails.length; i++) {
      const detail = saleTempDetails[i];
      sum += detail.FoodSize?.moneyAdded ?? 0;
    }
    return sum;
  };
  const generateSaleTempDetail = async (saleTempId: number) => {
    try {
      const payload = {
        saleTempId: saleTempId,
      };
      await api.post("/saleTemp/generateSaleTempDetail", payload);
      await fetchDataSaleTemp();
      fetchDataSaleTempInfo(saleTempId);
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  const selectTaste = async (
    tasteId: number,
    saleTempDetailId: number,
    saleTempId: Number,
  ) => {
    try {
      const payload = {
        saleTempDetailId: saleTempDetailId,
        tasteId: tasteId,
      };
      await api.put("/saleTemp/selectTaste", payload);
      fetchDataSaleTempInfo(Number(saleTempId));
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  const unSelectTaste = async (
    saleTempDetailId: number,
    saleTempId: number,
  ) => {
    try {
      const payload = {
        saleTempDetailId: saleTempDetailId,
      };
      await api.put("/saleTemp/unSelectTaste", payload);
      fetchDataSaleTempInfo(saleTempId);
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  const selectSize = async (
    sizeId: number,
    saleTempDetailId: number,
    saleTempId: number,
  ) => {
    try {
      const payload = {
        sizeId: sizeId,
        saleTempDetailId: saleTempDetailId,
      };
      await api.put("/saleTemp/selectSize", payload);
      await fetchDataSaleTempInfo(saleTempId);
      await fetchDataSaleTemp();
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  const createSaleTempDetail = async () => {
    try {
      const payload = {
        saleTempId: saleTempId,
      };
      await api.post("/saleTemp/createSaleTempDetail", payload);
      await fetchDataSaleTemp();
      fetchDataSaleTempInfo(saleTempId);
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  const removeAllSaleTempDetailModal = async (saleTempDetailId: number) => {
    try {
      const payload = {
        saleTempDetailId: saleTempDetailId,
      };
      await api.delete("/saleTemp/removeSaleTempDetailModal", {
        data: payload,
      });
      await fetchDataSaleTemp();
      fetchDataSaleTempInfo(saleTempId);
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  const printBillBeforePay = async () => {
    try {
      const payload = {
        tableNo: table,
        userId: Number(localStorage.getItem("next_user_id")),
      };
      const res = await api.post("/saleTemp/printBillBeforePay", payload);
      setTimeout(() => {
        setBillUrl(res.data.fileName);

        const button = document.getElementById("btnPrint") as HTMLButtonElement;
        button.click();
      }, 300);
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  const printBillAfterPay = async () => {
    try {
      const payload = {
        tableNo: table,
        userId: Number(localStorage.getItem("next_user_id")),
      };
      const res = await api.post("/saleTemp/printBillAfterPay", payload);
      setTimeout(() => {
        setBillUrl(res.data.fileName);

        const button = document.getElementById("btnPrint") as HTMLButtonElement;
        button.click();
      }, 300);
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  const endSale = async () => {
    try {
      const button = await Swal.fire({
        title: "Please check before Confirm bill",
        icon: "warning",
        showCancelButton: true,
        showConfirmButton: true,
      });
      if (button.isConfirmed) {
        const payload = {
          tableNo: table,
          userId: Number(localStorage.getItem("next_user_id")),
          payType: payType,
          inputMoney: receivedAmount,
          amount: amount + amountAdded,
          returnMoney: receivedAmount - (amount + amountAdded),
        };
        await api.post("/saleTemp/endSale", payload);
        fetchDataSaleTemp();

        document.getElementById("modalSale_btnClose")?.click();
        printBillAfterPay();
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
              <button
                disabled={saleTemps.length === 0}
                className="btn btn-danger"
                onClick={() => removeAllSaleTempDetail()}
              >
                <i className="fa fa-times me-2"></i>
                Clear
              </button>
              {amount > 0 ? (
                <button
                  className="btn btn-success ms-1"
                  onClick={(e) => printBillBeforePay()}
                >
                  <i className="fa fa-print me-2"></i>
                  Print Bill
                </button>
              ) : (
                <></>
              )}
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
                {(amount + amountAdded).toLocaleString("th-TH")}
              </div>
              {amount > 0 ? (
                <button
                  className="btn btn-success btn-lg w-100 mb-2"
                  data-bs-toggle="modal"
                  data-bs-target="#modalSale"
                >
                  <i className="fa fa-money-bill me-2"></i>
                  Pay
                </button>
              ) : (
                <></>
              )}
              {saleTemps.map((item: any) => (
                <div className="d-grid mt-2" key={item.id}>
                  <div className="card">
                    <div className="card-body">
                      <div className="fw-bold">{item.Food.name}</div>
                      <div>
                        {" "}
                        {item.Food.price} x {item.qty} ={" "}
                        {item.Food.price * item.qty}
                      </div>
                    </div>
                    <div className="mt-1">
                      <div className="input-group">
                        <button
                          disabled={item.qty <= 1}
                          className="input-group-text btn btn-primary"
                          onClick={(e) => updateQty(item.id, item.qty - 1)}
                        >
                          <i className="fa fa-minus"></i>
                        </button>
                        <input
                          type="text"
                          className="form-control text-center fw-bold"
                          value={item.qty}
                          disabled
                        />
                        <button
                          className="input-group-text btn btn-primary"
                          onClick={(e) => updateQty(item.id, item.qty + 1)}
                        >
                          <i className="fa fa-plus"></i>
                        </button>
                      </div>
                    </div>
                    <div className="card-footer p-1">
                      <div className="row g-1">
                        <div className="col-md-6">
                          <button
                            className="btn btn-danger btn-blocker"
                            onClick={(e) => removeSaleTempDetail(item.id)}
                          >
                            <i className="fa fa-times me-2"></i>
                            Cancel
                          </button>
                        </div>
                        <div className="col-md-6">
                          <button
                            className="btn btn-success btn-block"
                            data-bs-toggle="modal"
                            data-bs-target="#modalEdit"
                            onClick={(e) => openModalEdit(item)}
                          >
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
      <MyModal id="modalEdit" title="edit" modalSize="modal-xl">
        <div>
          <button
            className="btn btn-primary"
            onClick={(e) => createSaleTempDetail()}
          >
            <i className="fa fa-plus me-2">Add</i>
          </button>
        </div>
        <table className="table table-bordered mt-3">
          <thead>
            <tr>
              <th style={{ width: "60px" }}></th>
              <th>Name</th>
              <th style={{ width: "300px" }}>taste</th>
              <th style={{ width: "450px" }}>size</th>
            </tr>
          </thead>
          <tbody>
            {saleTempDetails.map((item: any) => (
              <tr key={item.id}>
                <td className="text-center">
                  <button
                    className="btn btn-danger"
                    onClick={(e) => removeAllSaleTempDetailModal(item.id)}
                  >
                    <i className="fa fa-times"></i>
                  </button>
                </td>
                <td>{item.Food.name}</td>
                <td className="text-center">
                  {tasted.map((taste: any) => {
                    const isSelected = item.tasteId === taste.id;

                    return (
                      <button
                        key={taste.id}
                        onClick={() =>
                          isSelected
                            ? unSelectTaste(item.id, item.saleTempId)
                            : selectTaste(taste.id, item.id, item.saleTempId)
                        }
                        className={`btn me-1 ${isSelected ? "btn-danger" : "btn-outline-danger"}`}
                      >
                        {taste.name}
                      </button>
                    );
                  })}
                </td>
                <td className="text-center">
                  {(sizes as any)
                    ?.filter((size: any) => size.moneyAdded >= 0)
                    ?.map((size: any) => {
                      const isSelected = item.foodSizeId === size.id;
                      return (
                        <button
                          key={size.id}
                          onClick={() =>
                            selectSize(size.id, item.id, item.saleTempId)
                          }
                          className={`btn me-1 ${isSelected ? "btn-success" : "btn-outline-success"}`}
                        >
                          +{size.moneyAdded} {size.name}
                        </button>
                      );
                    })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </MyModal>
      <MyModal id="modalSale" title="Summary" modalSize="modal-lg">
        <div className="fw-bold">Pay</div>
        <div className="row mt-1">
          <div className="col-md-6">
            <button
              className={
                payType === "cash"
                  ? "btn btn-success btn-block btn-lg"
                  : "btn btn-outline-secondary btn-block btn-lg"
              }
              onClick={() => setPayType("cash")}
            >
              <span className="h3">Cash</span>
            </button>
          </div>
          <div className="col-md-6">
            <button
              className={
                payType === "bank"
                  ? "btn btn-success btn-block btn-lg"
                  : "btn btn-outline-secondary btn-block btn-lg"
              }
              onClick={() => setPayType("bank")}
            >
              <span className="h3">Bank Tranfer</span>
            </button>
          </div>
        </div>
        <div className="mt-3 fw-bold">Total</div>
        <div className="h1">
          <input
            type="text"
            className="form-control text-end fs-4 p-4"
            value={(amount + amountAdded).toLocaleString("th-Th")}
            disabled
          />
        </div>
        <div className="mt-3 fw-bold">Received</div>
        <div className="row mt-1">
          <div className="col-md-3">
            <button
              className="btn btn-outline-secondary btn-block btn-lg"
              onClick={() => setReceivedAmount((prev) => prev + 10)}
            >
              <span className="h3">10</span>
            </button>
          </div>
          <div className="col-md-3">
            <button
              className="btn btn-outline-secondary btn-block btn-lg"
              onClick={() => setReceivedAmount((prev) => prev + 20)}
            >
              <span className="h3">20</span>
            </button>
          </div>
          <div className="col-md-3">
            <button
              className="btn btn-outline-secondary btn-block btn-lg"
              onClick={() => setReceivedAmount((prev) => prev + 50)}
            >
              <span className="h3">50</span>
            </button>
          </div>
          <div className="col-md-3">
            <button
              className="btn btn-outline-secondary btn-block btn-lg"
              onClick={() => setReceivedAmount((prev) => prev + 100)}
            >
              <span className="h3">100</span>
            </button>
          </div>
        </div>
        <input
          type="text"
          className="form-control text-end fs-4 p-4 mt-3"
          placeholder="0.00"
          value={receivedAmount}
          onChange={(e) => setReceivedAmount(parseFloat(e.target.value) || 0)}
        />
        <div className="mt-3 fw-bold">Change</div>
        <div className="h1">
          <input
            type="text"
            className="form-control text-end fs-4 p-4"
            value={(receivedAmount - (amount + amountAdded)).toLocaleString(
              "th-Th",
            )}
            disabled
          />
        </div>
        <div className="mt-3">
          <button
            disabled={receivedAmount - (amount + amountAdded) < 0}
            onClick={(e) => endSale()}
            className="btn btn-success btn-lg w-100"
          >
            <i className="fa fa-money-bill me-2"></i>
            Paid
          </button>
        </div>
      </MyModal>
      <button
        id="btnPrint"
        style={{ display: "none" }}
        data-bs-toggle="modal"
        data-bs-target="#modalPrint"
      ></button>
      <MyModal id="modalPrint" title="print" modalSize="">
        {billUrl && (
          <iframe
            src={config.apiServer + "/" + billUrl}
            width="100%"
            height="600px"
          ></iframe>
        )}
      </MyModal>
    </>
  );
}
