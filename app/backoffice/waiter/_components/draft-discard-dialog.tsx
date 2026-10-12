import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DraftDiscardDialog({
  open,
  tableNo,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  tableNo: number | null;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Poistetaanko lähettämätön luonnos?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Nykyiset tuotteet ja keskeneräinen valinta poistetaan.
            {tableNo !== null
              ? ` Uusi tilaus aloitetaan pöydälle ${tableNo}.`
              : " Lähetettyjä tilauksia ei muuteta."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">
            Jatka luonnosta
          </AlertDialogCancel>
          <Button
            variant="destructive"
            className="min-h-11"
            onClick={onConfirm}
          >
            Poista luonnos
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
