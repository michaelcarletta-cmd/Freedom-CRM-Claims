import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { Plus, Send } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";

interface Update {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  recipients: string[];
  profiles: {
    full_name: string | null;
    email: string;
  } | null;
}

interface Claim {
  client_id: string | null;
  referrer_id: string | null;
  claim_contractors: { contractor_id: string }[];
}

export const ClaimNotes = ({ claimId }: { claimId: string }) => {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [newUpdate, setNewUpdate] = useState("");
  const [claim, setClaim] = useState<Claim | null>(null);
  const [notifyClient, setNotifyClient] = useState(false);
  const [notifyReferrer, setNotifyReferrer] = useState(false);
  const [notifyContractors, setNotifyContractors] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user, userRole } = useAuth();
  const isStaff = userRole === "admin" || userRole === "staff";

  useEffect(() => {
    fetchUpdates();
    fetchClaim();

    const channel = supabase
      .channel('claim-updates-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'claim_updates',
          filter: `claim_id=eq.${claimId}`
        },
        () => {
          fetchUpdates();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [claimId]);

  const fetchClaim = async () => {
    const { data } = await supabase
      .from("claims")
      .select(`
        client_id,
        referrer_id,
        claim_contractors (contractor_id)
      `)
      .eq("id", claimId)
      .single();

    if (data) {
      setClaim(data);
    }
  };

  const fetchUpdates = async () => {
    const { data } = await supabase
      .from("claim_updates")
      .select(`
        id,
        content,
        created_at,
        user_id,
        recipients,
        profiles (full_name, email)
      `)
      .eq("claim_id", claimId)
      .order("created_at", { ascending: false });

    if (data) {
      setUpdates(data as Update[]);
    }
  };

  const handleAddUpdate = async () => {
    if (!newUpdate.trim() || !user) return;
    
    setLoading(true);
    const recipients: string[] = [];
    
    if (claim) {
      if (notifyClient && claim.client_id) recipients.push(claim.client_id);
      if (notifyReferrer && claim.referrer_id) recipients.push(claim.referrer_id);
      if (notifyContractors) {
        claim.claim_contractors.forEach(cc => recipients.push(cc.contractor_id));
      }
    }

    const { data: update, error: updateError } = await supabase
      .from("claim_updates")
      .insert({
        claim_id: claimId,
        content: newUpdate,
        user_id: user.id,
        update_type: "note",
        recipients: recipients
      })
      .select()
      .single();

    if (updateError) {
      toast.error("Failed to add update");
      setLoading(false);
      return;
    }

    // Create notifications for recipients
    if (recipients.length > 0 && update) {
      const notifications = recipients.map(recipient => ({
        user_id: recipient,
        claim_id: claimId,
        update_id: update.id
      }));

      await supabase.from("notifications").insert(notifications);
    }

    setNewUpdate("");
    setNotifyClient(false);
    setNotifyReferrer(false);
    setNotifyContractors(false);
    setLoading(false);
    toast.success("Update added successfully");
    fetchUpdates();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Textarea
          placeholder="Add a note or update..."
          value={newUpdate}
          onChange={(e) => setNewUpdate(e.target.value)}
          className="min-h-[100px]"
        />
        
        {isStaff && claim && (
          <div className="space-y-2 p-3 rounded-lg bg-muted/30">
            <Label className="text-sm font-medium">Notify:</Label>
            <div className="flex flex-wrap gap-4">
              {claim.client_id && (
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="notify-client" 
                    checked={notifyClient}
                    onCheckedChange={(checked) => setNotifyClient(checked as boolean)}
                  />
                  <Label htmlFor="notify-client" className="text-sm cursor-pointer">
                    Client
                  </Label>
                </div>
              )}
              {claim.referrer_id && (
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="notify-referrer" 
                    checked={notifyReferrer}
                    onCheckedChange={(checked) => setNotifyReferrer(checked as boolean)}
                  />
                  <Label htmlFor="notify-referrer" className="text-sm cursor-pointer">
                    Referrer
                  </Label>
                </div>
              )}
              {claim.claim_contractors.length > 0 && (
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="notify-contractors" 
                    checked={notifyContractors}
                    onCheckedChange={(checked) => setNotifyContractors(checked as boolean)}
                  />
                  <Label htmlFor="notify-contractors" className="text-sm cursor-pointer">
                    Contractors
                  </Label>
                </div>
              )}
            </div>
          </div>
        )}

        <Button 
          onClick={handleAddUpdate} 
          disabled={loading || !newUpdate.trim()}
          className="w-full bg-primary hover:bg-primary/90"
        >
          <Send className="h-4 w-4 mr-2" />
          {loading ? "Sending..." : "Add Update"}
        </Button>
      </div>

      <div className="space-y-4">
        {updates.map((update) => {
          const isCurrentUser = user?.id === update.user_id;
          const authorName = isCurrentUser 
            ? "You" 
            : update.profiles?.full_name || update.profiles?.email || "Unknown";
          
          return (
            <div key={update.id} className="flex gap-3 p-4 rounded-lg bg-muted/50">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {authorName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{authorName}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(update.created_at), "MMM d, yyyy h:mm a")}
                  </span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">{update.content}</p>
                {update.recipients && update.recipients.length > 0 && isStaff && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Notified {update.recipients.length} {update.recipients.length === 1 ? 'person' : 'people'}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {updates.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            No updates yet. Add the first update to this claim.
          </div>
        )}
      </div>
    </div>
  );
};
