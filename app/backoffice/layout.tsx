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
