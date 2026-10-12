import type { ReactNode } from "react";
import WaiterWorkspace from "./_components/waiter-workspace";

export default function WaiterLayout({ children }: { children: ReactNode }) {
  return <WaiterWorkspace>{children}</WaiterWorkspace>;
}
