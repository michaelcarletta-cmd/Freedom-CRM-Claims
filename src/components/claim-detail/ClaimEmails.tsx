import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail, Send, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmailComposer } from "@/components/EmailComposer";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface ClaimEmailsProps {
  claimId: string;
  claim: any;
}

export const ClaimEmails = ({ claimId, claim }: ClaimEmailsProps) => {
  const [isComposerOpen, setIsComposerOpen] = useState(false);

  const { data: emails, isLoading } = useQuery({
    queryKey: ["emails", claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("*")
        .eq("claim_id", claimId)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Email Communications</h3>
        <Button 
          className="bg-primary hover:bg-primary/90"
          onClick={() => setIsComposerOpen(true)}
        >
          <Send className="h-4 w-4 mr-2" />
          Compose Email
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : emails && emails.length > 0 ? (
        <div className="space-y-3">
          {emails.map((email) => (
            <div key={email.id} className="p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{email.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      To: {email.recipient_name || email.recipient_email} ({email.recipient_email})
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(email.sent_at), "MMM d, yyyy 'at' h:mm a")}
                  </span>
                  {email.recipient_type && (
                    <Badge variant="outline" className="text-xs">
                      {email.recipient_type}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="text-sm whitespace-pre-wrap bg-muted/50 rounded p-3">
                {email.body}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          No emails logged yet. Click "Compose Email" to send one.
        </div>
      )}

      <EmailComposer
        isOpen={isComposerOpen}
        onClose={() => setIsComposerOpen(false)}
        claimId={claimId}
        claim={claim}
      />
    </div>
  );
};