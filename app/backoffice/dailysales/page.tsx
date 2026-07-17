"use client";
import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import config from "@/app/config";
import axios from "axios";
import dayjs from "dayjs";

export default function DailySales() {
  const [arrYear, setArrYear] = useState<number[]>([]);
  const [arrMonth, setArrMonth] = useState([
    "Tammikuu",
    "Helmikuu",
    "Maaliskuu",
    "Huhtikuu",
    "Toukokuu",
    "Kesäkuu",
    "Heinäkuu",
    "Elokuu",
    "Syyskuu",
    "Lokakuu",
    "Marraskuu",
    "Joulukuu",
  ]);
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear(),
  );
  const [selectedMonth, setSelectedMonth] = useState<number>(
    new Date().getMonth() + 1,
  );
  const [data, setData] = useState([]);
  const [TotalAmount, setTotalAmount] = useState(0);

  useEffect(() => {
    setArrYear(Array.from({ length: 5 }, (_, index) => dayjs().year() - index));
    fetchData();
  }, []);
  const fetchData = async () => {
    try {
      const payload = {
        year: selectedYear,
        month: selectedMonth,
      };
        const headers = {
          'Authorization': `Bearer ${localStorage.getItem(config.token)}`
        }
      const res = await axios.post(
        `${config.apiServer}/api/report/dailySales`,
        payload,{headers},
      );
      setData(res.data.results);
      setTotalAmount(sumTotalAmount(res.data.results));
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  const sumTotalAmount = (data: any[]) => {
    let sum = 0;
    data.forEach((item) => {
      sum += item.amount;
    });
    return sum;
  };

  return (
    <>
      <div className="card mt-3">
        <div className="card-header">Daily Sales</div>
        <div className="card-body">
          <div className="row">
            <div className="col-3">
              <div>Year</div>
              <select
                className="form-control"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
              >
                {arrYear.map((year, index) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-3">
              <div>Month</div>
              <select
                id="ddlMonth"
                className="form-control"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
              >
                {arrMonth.map((month, index) => (
                  <option key={index} value={index + 1}>
                    {month}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-3">
              <div>&nbsp;</div>
              <button className="btn btn-primary" onClick={fetchData}>
                Show Data
              </button>
            </div>
          </div>
          <table className="table table-bordered mt-3">
            <thead>
              <tr>
                <th>Date</th>
                <th className="text-end" style={{ width: "100px" }}>
                  Sales
                </th>
              </tr>
            </thead>
            <tbody>
              {data.length > 0 &&
                data.map((item: any, index: number) => (
                  <tr key={index}>
                    <td>{dayjs(item.date).format("DD")}</td>
                    <td className="text-end">
                      {item.amount.toLocaleString("th-TH")}
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="text-end">Total</td>
                <td className="text-end">
                  {TotalAmount.toLocaleString("th-TH")}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
