"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import config from "@/app/config";
import dayjs from "dayjs";
import MyModal from "../components/mymodal";

export default function Page() {
  const [billSales, setBillSales] = useState([]);
  const [fromDate, setFromDate] = useState(new Date());
  const [toDate, SetToDate] = useState(new Date());
  const [sumAmount, setSumAmount] = useState(0);
  const [billSaleDetails, setBillSaleDetails] = useState([]);


  useEffect(() => {
    fetchData();
  }, []);

  const handleCancelBill = async (id: string) => {
    try {
      const button = await Swal.fire({
        icon: "warning",
        title: "Confirm Cancel",
        text: "Please check before confirm",
        showCancelButton: true,
        showConfirmButton: true,
      });

      if (button.isConfirmed) {
        await axios.delete(`${config.apiServer}/api/billSale/remove/${id}`);
        fetchData();
      }
    } catch (e: any) {
      Swal.fire({
        icon: "error",
        title: "error",
        text: e.message,
      });
    }
  };

  const fetchData = async () => {
    try {
      const payload = {
        startDate: new Date(fromDate),
        endDate: new Date(toDate),
      };
      const response = await axios.post(
        `${config.apiServer}/api/billSale/list`,
        payload,
      );
      setBillSales(response.data.results);

      const sum = handleSumAmount(response.data.results);
      setSumAmount(sum);
    } catch (e: any) {
      Swal.fire({
        icon: "error",
        title: "error",
        text: e.message,
      });
    }
  };
  const handleSumAmount = (rows: any[]) => {
    let sum = 0;
    rows.forEach((row: any) => {
      sum += row.amount;
    });
    return sum;
  };

  return (
    <>
      <div className="card mt-3">
        <div className="card-header">Sale List</div>
        <div className="card-body">
          <div className="row">
            <div className="col-2">
              <div>From</div>
              <input
                type="date"
                className="form-control"
                value={dayjs(fromDate).format("YYYY-MM-DD")}
                onChange={(e) => setFromDate(new Date(e.target.value))}
              />
            </div>
            <div className="col-2">
              <div>To</div>
              <input
                type="date"
                className="form-control"
                value={dayjs(toDate).format("YYYY-MM-DD")}
                onChange={(e) => SetToDate(new Date(e.target.value))}
              />
            </div>
            <div className="col-2">
              <div>&nbsp;</div>
              <button className="btn btn-primary" onClick={fetchData}>
                <i className="fa fa-search me-2"></i>
                Show
              </button>
            </div>
          </div>
          <table className="table table-bordered mt-3">
            <thead>
              <tr>
                <th style={{ width: "250px" }} className="text-center">
                  Cancel
                </th>
                <th style={{ width: "200px" }} className="text-center">
                  Day
                </th>
                <th>Bill No.</th>
                <th style={{ width: "150px" }}>Seller</th>
                <th style={{ width: "100px" }} className="text-end">
                  Table
                </th>
                <th style={{ width: "100px" }} className="text-end">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {billSales.length > 0 &&
                billSales.map((billSale: any, index: number) => (
                  <tr key={index}>
                    <td className="text-center">
                      <button
                        className="btn btn-danger"
                        onClick={() => handleCancelBill(billSale.id)}
                      >
                        <i className="fa fa-times me-2"></i>
                        Cancel
                      </button>
                      <button className="btn btn-primary m-2"
                      onClick={() =>setBillSaleDetails(billSale.BillSaleDetails)}
                      data-bs-toggle="modal"
                      data-bs-target="#modalBillSaleDetail"
                      >
                        <i className="fa fa-info me-2"></i>
                        Detail
                      </button>
                    </td>
                    <td>{dayjs(billSale.payDate).format("DD/MM/YYYY HH:mm:ss")}</td>
                    <td>{billSale.id}</td>
                    <td>{billSale.User.name}</td>
                    <td className="text-end">{billSale.tableNo}</td>
                    <td className="text-end">{billSale.amount.toLocaleString('th-TH')}</td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
                <tr>
                <td className="text-end" colSpan={5}>Total</td>
                <td className="text-end">{sumAmount.toLocaleString('th-TH')}</td>
                </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <MyModal id="modalBillSaleDetail" title="Detail" modalSize="modal-lg">
        <div className="row">
          <div className="col-12">
          </div>
          <table className="table table-bordered ">
            <thead>
              <tr>
                <th>Menu</th>
                  <th>Price</th>
                  <th>Taste</th>
                    <th>Quantity</th>
                   
              </tr>
            </thead>
            <tbody>
              {billSaleDetails.length > 0 &&
                billSaleDetails.map((billSaleDetail: any, index: number) => (
                  <tr key={index}>
                    <td>{billSaleDetail.Food.name}</td>
                    <td>{(billSaleDetail.price + billSaleDetail.moneyAdded).toLocaleString('th-TH')}</td>
                    <td>{billSaleDetail.Taste?.name}</td>
                    <td>{billSaleDetail.foodSizeId && billSaleDetail.FoodSize?.name + '+' + billSaleDetail.moneyAdded}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </MyModal>
    </>
  );
}
