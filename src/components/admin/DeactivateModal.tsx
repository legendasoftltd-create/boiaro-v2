import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface DeactivateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  onConfirm: (reason: string, type: "temporary" | "permanent") => void;
}

export function DeactivateModal({ open, onOpenChange, itemName, onConfirm }: DeactivateModalProps) {
  const [reason, setReason] = useState("");
  const [type, setType] = useState<"temporary" | "permanent">("temporary");

  const handleConfirm = () => {
    onConfirm(reason.trim(), type);
    setReason("");
    setType("temporary");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Deactivate {itemName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Deactivation Type</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as any)} className="mt-2 space-y-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="temporary" id="temp" />
                <Label htmlFor="temp" className="font-normal cursor-pointer">Temporary — can be re-enabled anytime</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="permanent" id="perm" />
                <Label htmlFor="perm" className="font-normal cursor-pointer">Permanent — intended to stay disabled</Label>
              </div>
            </RadioGroup>
          </div>
          <div>
            <Label>Reason (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this being deactivated?"
              rows={3}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirm}>Deactivate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
