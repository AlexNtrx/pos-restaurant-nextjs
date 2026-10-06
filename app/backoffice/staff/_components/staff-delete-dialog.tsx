import type { StaffUser } from "../_lib/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
export function StaffDeleteDialog({
  pendingDelete,
  isDeleting,
  setPendingDelete,
  remove,
}: {
  pendingDelete: StaffUser | null;
  isDeleting: boolean;
  setPendingDelete: (user: StaffUser | null) => void;
  remove: () => Promise<void>;
}) {
  return (
    <AlertDialog
      open={pendingDelete !== null}
      onOpenChange={(open) => !open && !isDeleting && setPendingDelete(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Poistetaanko henkilöstötili?</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingDelete
              ? `${pendingDelete.username} poistetaan käytöstä. Käyttäjä ei voi enää kirjautua sisään.`
              : "Tili poistetaan käytöstä."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Peruuta</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isDeleting}
            onClick={(event) => {
              event.preventDefault();
              void remove();
            }}
          >
            {isDeleting ? "Poistetaan…" : "Poista"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
