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
import { Copy, Check, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface CredentialsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  password: string;
  userType: string;
  userName?: string;
}

export const CredentialsDialog = ({
  isOpen,
  onClose,
  email,
  password,
  userType,
  userName,
}: CredentialsDialogProps) => {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

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

  const handleSendInvite = async () => {
    console.log("handleSendInvite called with:", { email, password, userType, userName });
    setSendingEmail(true);
    try {
      const appUrl = window.location.origin;
      console.log("Invoking send-portal-invite with appUrl:", appUrl);
      
      const { data, error } = await supabase.functions.invoke("send-portal-invite", {
        body: { email, password, userType, userName, appUrl },
      });

      console.log("send-portal-invite response:", { data, error });

      if (error) throw error;

      setEmailSent(true);
      toast.success("Invitation email sent successfully");
    } catch (error: any) {
      console.error("Error sending invite:", error);
      toast.error(error.message || "Failed to send invitation email");
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{userType} Account Created</DialogTitle>
          <DialogDescription>
            Save these login credentials or send them via email. The password cannot be retrieved later.
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
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button 
              variant="outline" 
              onClick={handleSendInvite}
              disabled={sendingEmail || emailSent}
              className="flex-1"
            >
              {sendingEmail ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : emailSent ? (
                <Check className="h-4 w-4 mr-2 text-green-500" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              {emailSent ? "Email Sent" : "Send Invite Email"}
            </Button>
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
