import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Link2 } from "lucide-react";

interface CreatorAccountFieldsProps {
  isEdit: boolean;
  hasExistingUserId: boolean;
  createAccount: boolean;
  onCreateAccountChange: (v: boolean) => void;
  email: string;
  onEmailChange: (v: string) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  confirmPassword: string;
  onConfirmPasswordChange: (v: string) => void;
}

export function CreatorAccountFields({
  isEdit,
  hasExistingUserId,
  createAccount,
  onCreateAccountChange,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  confirmPassword,
  onConfirmPasswordChange,
}: CreatorAccountFieldsProps) {
  if (isEdit && hasExistingUserId) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50 border border-border/40">
        <Link2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Account linked</span>
        <Badge variant="secondary" className="text-xs">Connected</Badge>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3 rounded-lg border border-border/40 bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">
            {isEdit ? "Link Account" : "Create Login Account"}
          </Label>
        </div>
        <Switch checked={createAccount} onCheckedChange={onCreateAccountChange} />
      </div>

      {createAccount && (
        <div className="space-y-2 pt-1">
          <div>
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              placeholder="creator@example.com"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
            />
          </div>
          {!isEdit && (
            <>
              <div>
                <Label className="text-xs">Password</Label>
                <Input
                  type="password"
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Confirm Password</Label>
                <Input
                  type="password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => onConfirmPasswordChange(e.target.value)}
                />
              </div>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            {isEdit
              ? "Enter the email of an existing user to link this profile."
              : "A login account will be created. The creator can use these credentials to log in."}
          </p>
        </div>
      )}
    </div>
  );
}
