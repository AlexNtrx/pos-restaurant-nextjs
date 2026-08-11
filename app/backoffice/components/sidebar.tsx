"use client";
import Swal from "sweetalert2";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { clearAuthSession } from "@/lib/auth-session";
import {
  backofficeNavigation,
  canAccessBackofficePath,
  type UserLevel,
  // Loads error message for the current workflow.
} from "@/lib/access-control";

// Loads error message for the current workflow.
function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred.";
}

type SidebarProps = {
  name: string;
  userLevel: UserLevel;
  // Renders the sidebar interface.
};

// Renders the sidebar interface.
export default function Sidebar({ name, userLevel }: SidebarProps) {
  const router = useRouter();

  // Coordinates sign out behavior for this module.
  const signOut = async () => {
    try {
      const button = await Swal.fire({
        title: "Sign out",
        text: "Are you sure you want to sign out?",
        icon: "question",
        showCancelButton: true,
        showConfirmButton: true,
      });
      if (button.isConfirmed) {
        clearAuthSession();

        router.replace("/signin");
      }
    } catch (error: unknown) {
      void Swal.fire({
        title: "Something went wrong",
        text: getErrorMessage(error),
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
              <button className="btn btn-danger mt-3" onClick={signOut}>
                <i className="fa fa-times mr-2" aria-hidden="true"></i>
                Sign out
              </button>
            </div>
          </div>

          <nav className="mt-2">
            <ul
              className="nav nav-pills nav-sidebar flex-column"
              data-widget="treeview"
              role="menu"
              data-accordion="false"
            >
              {backofficeNavigation
                .filter(({ href }) => canAccessBackofficePath(href, userLevel))
                .map((item) => (
                  <li className="nav-item" key={item.href}>
                    <Link href={item.href} className="nav-link">
                      <i className={`nav-icon ${item.icon}`}></i>
                      <p>{item.label}</p>
                    </Link>
                  </li>
                ))}
            </ul>
          </nav>
        </div>
      </aside>
    </>
  );
}
