import { useState, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

interface ConfirmOptions {
  title?: string;
  message?: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

const DEFAULT_STATE: ConfirmState = {
  open: false,
  title: "Confirm Delete",
  message: "Are you sure you want to delete this item?",
  confirmLabel: "Delete",
  onConfirm: () => {},
};

export function useConfirmDialog() {
  const [state, setState] = useState<ConfirmState>(DEFAULT_STATE);

  const openConfirm = useCallback((opts: ConfirmOptions) => {
    setState({
      open: true,
      title: opts.title ?? "Confirm Delete",
      message: opts.message ?? "Are you sure you want to delete this item?",
      confirmLabel: opts.confirmLabel ?? "Delete",
      onConfirm: opts.onConfirm,
    });
  }, []);

  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  const dialog = (
    <AlertDialog open={state.open} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title}</AlertDialogTitle>
          <AlertDialogDescription>{state.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { state.onConfirm(); close(); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {state.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { dialog, openConfirm };
}
