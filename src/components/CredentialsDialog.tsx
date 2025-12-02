import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface CredentialsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  password: string;
  userType: string;
}

export const CredentialsDialog = ({
  isOpen,
  onClose,
  email,
  password,
  userType,
}: CredentialsDialogProps) => {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const handleCopy = async (text: string, type: "email" | "password") => {
    await navigator.clipboard.writeText(text);
    if (type === "email") {
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    } else {
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    }
    toast.success(`${type === "email" ? "Email" : "Password"} copied to clipboard`);
  };

  const handleCopyAll = async () => {
    const text = `Email: ${email}\nPassword: ${password}`;
    await navigator.clipboard.writeText(text);
    toast.success("Credentials copied to clipboard");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{userType} Account Created</DialogTitle>
          <DialogDescription>
            Save these login credentials. The password cannot be retrieved later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <div className="flex gap-2">
              <Input value={email} readOnly className="bg-muted" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleCopy(email, "email")}
              >
                {copiedEmail ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Temporary Password</Label>
            <div className="flex gap-2">
              <Input value={password} readOnly className="bg-muted font-mono" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleCopy(password, "password")}
              >
                {copiedPassword ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={handleCopyAll}>
              Copy All
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
