import "../../public/plugins/fontawesome-free/css/all.min.css";
import "../../public/plugins/tempusdominus-bootstrap-4/css/tempusdominus-bootstrap-4.min.css";
import "../../public/dist/css/adminlte.min.css";
// Renders the dashboard layout interface.
import SessionBoundary from "./components/session-boundary";

// Renders the dashboard layout interface.
export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <SessionBoundary>{children}</SessionBoundary>;
}
