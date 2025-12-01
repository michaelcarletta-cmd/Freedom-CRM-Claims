import { Button } from "@/components/ui/button";
import { Mail, Send, Reply } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  timestamp: string;
  read: boolean;
}

// No mock data - all emails will be managed by users
const mockEmails: Email[] = [];

export const ClaimEmails = ({ claimId }: { claimId: string }) => {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Email Thread</h3>
        <Button className="bg-primary hover:bg-primary/90">
          <Send className="h-4 w-4 mr-2" />
          Compose Email
        </Button>
      </div>

      {mockEmails.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No emails logged yet. Click "Compose Email" to send one.
        </div>
      ) : (
        <div className="space-y-3">
          {mockEmails.map((email, index) => (
            <div key={email.id}>
              <div className="p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{email.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        From: {email.from}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{email.timestamp}</span>
                    {!email.read && <Badge variant="default" className="h-5 text-xs">New</Badge>}
                  </div>
                </div>
                <p className="text-sm text-foreground mb-3">{email.body}</p>
                <Button variant="outline" size="sm">
                  <Reply className="h-3 w-3 mr-1" />
                  Reply
                </Button>
              </div>
              {index < mockEmails.length - 1 && <Separator className="my-3" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
