import { Button } from "@/components/ui/button";
import type { StaffUser } from "../_lib/types";
import { Pencil, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { roleLabels } from "../_lib/types";
export function StaffList({
  users,
  currentUserId,
  openEdit,
  setPendingDelete,
}: {
  users: StaffUser[];
  currentUserId: number | null;
  openEdit: (user: StaffUser) => void;
  setPendingDelete: (user: StaffUser | null) => void;
}) {
  return (
    <Table className="min-w-[680px]">
      <TableHeader>
        <TableRow>
          <TableHead>Nimi</TableHead>
          <TableHead>Käyttäjätunnus</TableHead>
          <TableHead>Rooli</TableHead>
          <TableHead className="text-right">Toiminnot</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell className="font-medium">{user.name}</TableCell>
            <TableCell>{user.username}</TableCell>
            <TableCell>
              <StatusBadge tone={user.level === "admin" ? "info" : "neutral"}>
                {roleLabels[user.level]}
              </StatusBadge>
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEdit(user)}
                >
                  <Pencil aria-hidden="true" /> Muokkaa
                </Button>
                {currentUserId !== user.id && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setPendingDelete(user)}
                    aria-label={`Poista ${user.username}`}
                  >
                    <Trash2 aria-hidden="true" className="text-destructive" />
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
