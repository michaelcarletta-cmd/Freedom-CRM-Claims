import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Send, Users, UserCheck, Building2 } from "lucide-react";

interface Contractor {
  contractor_id: string;
  profiles?: {
    full_name: string | null;
    email: string;
  } | null;
}

interface Referrer {
  id: string;
  name: string;
  email: string | null;
  user_id?: string | null;
}

interface Client {
  id: string;
  name: string;
  user_id: string | null;
}

interface NotifyPortalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claimId: string;
  clientId: string | null;
  referrerId: string | null;
  contractors: Contractor[];
  policyholderName: string;
  referrer?: Referrer | null;
}

export function NotifyPortalDialog({
  open,
  onOpenChange,
  claimId,
  clientId,
  referrerId,
  contractors,
  policyholderName,
  referrer,
}: NotifyPortalDialogProps) {
  const [message, setMessage] = useState("");
  const [notifyClient, setNotifyClient] = useState(false);
  const [notifyReferrer, setNotifyReferrer] = useState(false);
  const [notifyContractors, setNotifyContractors] = useState(false);
  const [loading, setLoading] = useState(false);
  const [client, setClient] = useState<Client | null>(null);
  const { user } = useAuth();

  // Fetch client data to get their user_id for portal notifications
  useEffect(() => {
    const fetchClient = async () => {
      if (clientId) {
        const { data } = await supabase
          .from("clients")
          .select("id, name, user_id")
          .eq("id", clientId)
          .single();
        setClient(data);
      } else {
        setClient(null);
      }
    };

    if (open) {
      setMessage("");
      setNotifyClient(false);
      setNotifyReferrer(false);
      setNotifyContractors(false);
      fetchClient();
    }
  }, [open, clientId]);

  const handleSendNotification = async () => {
    if (!message.trim() || !user) return;

    const recipients: string[] = [];
    
    // Use client's user_id (auth user), not client_id (client record)
    if (notifyClient && client?.user_id) {
      recipients.push(client.user_id);
    }
    
    // Use referrer's user_id (auth user), not referrer_id (referrer record)
    if (notifyReferrer && referrer?.user_id) {
      recipients.push(referrer.user_id);
    }
    
    // Contractors are already user_ids
    if (notifyContractors) {
      contractors.forEach((c) => recipients.push(c.contractor_id));
    }

    if (recipients.length === 0) {
      toast.error("Please select at least one recipient with portal access");
      return;
    }

    setLoading(true);

    try {
      const { data: update, error: updateError } = await supabase
        .from("claim_updates")
        .insert({
          claim_id: claimId,
          content: message,
          user_id: user.id,
          update_type: "notification",
          recipients: recipients,
        })
        .select()
        .single();

      if (updateError) throw updateError;

      if (update) {
        const notifications = recipients.map((recipient) => ({
          user_id: recipient,
          claim_id: claimId,
          update_id: update.id,
        }));

        await supabase.from("notifications").insert(notifications);
      }

      toast.success(`Notification sent to ${recipients.length} recipient(s)`);
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error sending notification:", error);
      toast.error("Failed to send notification");
    } finally {
      setLoading(false);
    }
  };

  // Check if recipients have portal access (user_id set)
  const clientHasPortal = client?.user_id;
  const referrerHasPortal = referrer?.user_id;
  const hasRecipients = clientHasPortal || referrerHasPortal || contractors.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Send Portal Notification
          </DialogTitle>
        </DialogHeader>

        {!hasRecipients ? (
          <div className="py-8 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No portal users with access are assigned to this claim.</p>
            <p className="text-sm mt-1">
              Assign a client, referrer, or contractor with portal access first.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Select Recipients:</Label>
              <div className="space-y-2 p-3 rounded-lg bg-muted/30">
                {clientHasPortal && (
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="notify-client"
                      checked={notifyClient}
                      onCheckedChange={(checked) => setNotifyClient(checked as boolean)}
                    />
                    <Label
                      htmlFor="notify-client"
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <UserCheck className="h-4 w-4 text-primary" />
                      Client/Policyholder ({client?.name || policyholderName})
                    </Label>
                  </div>
                )}
                {referrerHasPortal && referrer && (
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="notify-referrer"
                      checked={notifyReferrer}
                      onCheckedChange={(checked) => setNotifyReferrer(checked as boolean)}
                    />
                    <Label
                      htmlFor="notify-referrer"
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Users className="h-4 w-4 text-primary" />
                      Referrer ({referrer.name})
                    </Label>
                  </div>
                )}
                {contractors.length > 0 && (
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="notify-contractors"
                      checked={notifyContractors}
                      onCheckedChange={(checked) => setNotifyContractors(checked as boolean)}
                    />
                    <Label
                      htmlFor="notify-contractors"
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Building2 className="h-4 w-4 text-primary" />
                      Contractors ({contractors.length})
                    </Label>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                placeholder="Enter your notification message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[120px]"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSendNotification}
            disabled={loading || !message.trim() || !hasRecipients}
            className="bg-primary hover:bg-primary/90"
          >
            <Send className="h-4 w-4 mr-2" />
            {loading ? "Sending..." : "Send Notification"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
