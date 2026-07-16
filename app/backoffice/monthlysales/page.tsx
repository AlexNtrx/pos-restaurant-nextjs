"use client";
import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import config from "@/app/config";
import axios from "axios";
import dayjs from "dayjs";

export default function MonthlySales() {
  const [data, setData] = useState([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [arrYear, setArrYear] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState(dayjs().year());

 useEffect(() => {
  setArrYear(Array.from({ length: 5 }, (_, index) => dayjs().year() - index));
  fetchData();
}, []);
  const fetchData = async () => {
    try {
      const payload = {
        year: selectedYear,
      };
      const res = await axios.post(
        config.apiServer + "/api/report/sumMonthly",
        payload,
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
  const sumTotalAmount =(data:any[]) =>{
    let sum = 0;
    data.forEach((item:any) =>{
        sum += item.amount;
    });
    return sum
  }
  return(
    <>
        <div className="card mt-3">
            <div className="card-header">Monthly Sales</div>
            <div className="card-body">
              <div className="row">
                <div className="col-3">
                  <div>Year</div>
                  <select
                    className="form-select"
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
                  <div>&nbsp;</div>
                  <button className="btn btn-primary" onClick={fetchData}>
                    Show Data
                  </button>
                </div>
              </div>
              <table className="table table-bordered mt-3">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="text-end" style={{ width: "100px" }}>
                      Sales
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.length > 0 &&
                    data.map((item: any, index: number) => (
                      <tr key={index}>
                        <td>{item.month}</td>
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
                      {totalAmount.toLocaleString("th-TH")}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
    </>

  ) 
}
