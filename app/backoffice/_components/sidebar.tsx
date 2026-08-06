"use client";
import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import config from "@/app/config";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";

export default function Sidebar() {
  const [name, setName] = useState("");
  const router = useRouter();
  const [userLevel, setUserLevel] = useState("");

  useEffect(() => {
    const token = localStorage.getItem(config.token);

    getUserLevel();

    if (!token) {
      Swal.fire({
        title: "กรุณาล็อกอิน",
        text: "คุณไม่มีสิทธิ์เข้าถึงหน้านี้",
        icon: "warning",
        confirmButtonText: "ตกลง",
      }).then(() => {
        router.push("/signin");
      });
      return;
    }

    const savedName = localStorage.getItem("next_name");
    setName(savedName ?? "");
  }, [router]);

  const getUserLevel = async () => {
    try {
      const token = localStorage.getItem(config.token);

      if (token !== null) {
        const headers = {
          Authorization: `Bearer ${token}`,
        };
        const res = await axios.get(
          config.apiServer + "/api/user/getLevelByToken",
          { headers },
        );
        setUserLevel(res.data.level);
      }
    } catch (e: any) {
      Swal.fire({
        title: "error",
        text: e.message,
        icon: "error",
      });
    }
  };

  const signOut = async () => {
    try {
      const button = await Swal.fire({
        title: "ออกจากระบบ",
        text: "คุณต้องการออกจากระบบ",
        icon: "question",
        showCancelButton: true,
        showConfirmButton: true,
      });
      if (button.isConfirmed) {
        localStorage.removeItem(config.token);
        localStorage.removeItem("next_name");
        localStorage.removeItem("next_user_id");

        router.push("/signin");
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
      <aside className="main-sidebar sidebar-dark-primary elevation-4">
        <a href="index3.html" className="brand-link">
          <img
            src="dist/img/AdminLTELogo.png"
            alt="AdminLTE Logo"
            className="brand-image img-circle elevation-3"
            style={{ opacity: 0.8 }}
          />
          <span className="brand-text font-weight-light">AdminLTE 3</span>
        </a>

        <div className="sidebar">
          <div className="user-panel mt-3 pb-3 mb-3 d-flex">
            <div className="image">
              <img
                src="dist/img/user2-160x160.jpg"
                className="img-circle elevation-2"
                alt="User Image"
              />
            </div>
            <div className="info">
              <a href="#" className="d-block">
                {name}
              </a>
              <div className="btn btn-danger mt-3" onClick={signOut}>
                <i className="fa fa-times mr-2">ออกจากระบบ</i>
              </div>
            </div>
          </div>

          <nav className="mt-2">
            <ul
              className="nav nav-pills nav-sidebar flex-column"
              data-widget="treeview"
              role="menu"
              data-accordion="false"
            >
              {userLevel === "admin" && (
                <li className="nav-item">
                  <Link href="/backoffice/dashboard" className="nav-link">
                    <i className="nav-icon fas fa-list"></i>
                    <p>Dashboard</p>
                  </Link>
                </li>
              )}

              {(userLevel === "admin" || userLevel === "user") && (
                <li className="nav-item">
                  <Link href="/backoffice/sale" className="nav-link">
                    <i className="nav-icon fas fa-list"></i>
                    <p>sale</p>
                  </Link>
                </li>
              )}
              {userLevel === "admin" && (
                <>
                  {" "}
                  <li className="nav-item">
                    <Link href="/backoffice/user" className="nav-link">
                      <i className="nav-icon fas fa-list"></i>
                      <p>User</p>
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link href="/backoffice/food-type" className="nav-link">
                      <i className="nav-icon fas fa-th"></i>
                      <p>ประเภท</p>
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link href="/backoffice/food-size" className="nav-link">
                      <i className="nav-icon fas fa-list"></i>
                      <p>ขนาด</p>
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link href="/backoffice/taste" className="nav-link">
                      <i className="nav-icon fas fa-list"></i>
                      <p>รสชาติอาหาร</p>
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link href="/backoffice/food" className="nav-link">
                      <i className="nav-icon fas fa-list"></i>
                      <p>อาหาร</p>
                    </Link>
                  </li>
                      <li className="nav-item">
                    <Link href="/backoffice/food-paginate" className="nav-link">
                      <i className="nav-icon fas fa-list"></i>
                      <p>FOOD LIST</p>
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link href="/backoffice/organization" className="nav-link">
                      <i className="nav-icon fas fa-list"></i>
                      <p>Organization</p>
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link href="/backoffice/salereport" className="nav-link">
                      <i className="nav-icon fas fa-list"></i>
                      <p>Sale Report</p>
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link href="/backoffice/dailysales" className="nav-link">
                      <i className="nav-icon fas fa-list"></i>
                      <p>Daily Sales</p>
                    </Link>
                  </li>
                  <li className="nav-item">
                    <Link href="/backoffice/monthlysales" className="nav-link">
                      <i className="nav-icon fas fa-list"></i>
                      <p>Monthly Sales</p>
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </nav>
        </div>
      </aside>
    </>
  );
}
