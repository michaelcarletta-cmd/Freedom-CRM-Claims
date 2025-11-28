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

const mockEmails: Email[] = [
  {
    id: "1",
    from: "john.smith@email.com",
    to: "you@company.com",
    subject: "Re: Claim Documentation Request",
    body: "I've attached all the requested documents including photos and repair estimates. Please let me know if you need anything else.",
    timestamp: "2024-01-20 3:45 PM",
    read: true,
  },
  {
    id: "2",
    from: "sarah.mitchell@abcinsurance.com",
    to: "you@company.com",
    subject: "Claim Approval Notification",
    body: "Good news! The claim has been approved for $45,000. The settlement will be processed within 5-7 business days.",
    timestamp: "2024-01-19 11:20 AM",
    read: true,
  },
  {
    id: "3",
    from: "you@company.com",
    to: "john.smith@email.com",
    subject: "Initial Claim Assessment",
    body: "Thank you for filing your claim. We've completed the initial assessment and will schedule an adjuster visit within 48 hours.",
    timestamp: "2024-01-16 2:00 PM",
    read: true,
  },
];

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
    </div>
  );
};
