"use client";
import { useState, useEffect, useRef } from "react";
import dayjs from "dayjs";
import { Chart as ChartJS } from "chart.js/auto";
import Swal from "sweetalert2";
import api from "@/lib/api";
import config from "@/app/config";

export default function Dashboard() {
  const [incomeDaily, setIncomDaily] = useState<any[]>([]);
  const [incomeMonthly, setIncomeMonthly] = useState<any[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [monthName] = useState<string[]>([
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
  const [days, setDays] = useState<number[]>([]);
  const [year, setYear] = useState<number>(0);
  const [selectedYear, setSelectedYear] = useState<number>(dayjs().year());
  const [month, setMonth] = useState<number>(dayjs().month() + 1);
  const dailyChartRef = useRef<ChartJS | null>(null);
  const monthlyChartRef = useRef<ChartJS | null>(null);

  useEffect(() => {
    const totalDayInMonth = dayjs().daysInMonth();

    setDays(Array.from({ length: totalDayInMonth }, (_, i) => i + 1));
    setYears(Array.from({ length: 5 }, (_, i) => dayjs().year() - i));

    fetchData();
  }, []);

  const fetchData = () => {
    fetchDataSumPerDayInYearAndMonth();
    fetchDataSumPerDayMonthInyear();
  };

  const creatBarChartDays = (incomeDaily: any[]) => {
    let labels: number[] = [];
    let datas: number[] = [];

    for (let i = 0; i < incomeDaily.length; i++) {
      const item = incomeDaily[i];
      labels.push(i + 1);
      datas.push(item.amount);
    }
    const ctx = document.getElementById("chartPerDay") as HTMLCanvasElement;
    if (dailyChartRef.current) {
      dailyChartRef.current.destroy();
    }
    dailyChartRef.current = new ChartJS(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Income Daily",
            data: datas,
            borderWidth: 1,
          },
        ],
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    });
  };
  const fetchDataSumPerDayInYearAndMonth = async () => {
    try {
      const payload = {
        year: selectedYear,
        month: month,
      };
      const res = await api.post("/report/dailySales", payload);
      setIncomDaily(res.data.results);
      creatBarChartDays(res.data.results);
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };
  const creatBarChartMonths = (incomeMonthly: any[]) => {
    let datas: number[] = [];
    for (let i = 0; i < incomeMonthly.length; i++) {
      const item = incomeMonthly[i];
      datas.push(item.amount);
    }
    const ctx = document.getElementById("chartPerMonth") as HTMLCanvasElement;
    if (monthlyChartRef.current) {
      monthlyChartRef.current.destroy();
    }
    monthlyChartRef.current = new ChartJS(ctx, {
      type: "bar",
      data: {
        labels: monthName,
        datasets: [
          {
            label: "Income Monthly",
            data: datas,
            borderWidth: 1,
          },
        ],
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    });
  };
  const fetchDataSumPerDayMonthInyear = async () => {
    try {
      const payload = {
        year: selectedYear,
      };
      const res = await api.post("/report/sumMonthly", payload);
      setIncomeMonthly(res.data.results);
      creatBarChartMonths(res.data.results);
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
      <div className="mt-3 card">
        <div className="card-header">Dashboard</div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-3">
              <div className="form-group">
                <select
                  name=""
                  id=""
                  className="form-control"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="col-md-3">
              <div className="form-group">
                <select
                  name=""
                  id=""
                  className="form-control"
                  value={month}
                  onChange={(e) => setMonth(parseInt(e.target.value))}
                >
                  {monthName.map((month, index) => (
                    <option value={index + 1} key={month}>
                      {month}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="col-md-3">
              <button className="btn btn-primary" onClick={fetchData}>
                <i className="fa fa-search me-2">Show</i>
              </button>
            </div>
          </div>
          <div className="col-md-12">
            <div className="h4">Daily Sales</div>
            <canvas id="chartPerDay" height={120}></canvas>
          </div>
          <div className="col-md-12">
            <div className="h4">Monthly Sales</div>
            <canvas id="chartPerMonth" height={120}></canvas>
          </div>
        </div>
      </div>
    </>
  );
}
