import { Button } from "@/components/ui/button";
import { Phone, MessageSquare, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Communication {
  id: string;
  type: "phone" | "text";
  contact: string;
  summary: string;
  timestamp: string;
  duration?: string;
}

const mockCommunications: Communication[] = [
  {
    id: "1",
    type: "phone",
    contact: "John Smith",
    summary: "Discussed repair timeline and contractor scheduling. Client confirmed availability for next week.",
    timestamp: "2024-01-20 10:15 AM",
    duration: "12 min",
  },
  {
    id: "2",
    type: "text",
    contact: "John Smith",
    summary: "Client sent photos of additional damage found in attic space.",
    timestamp: "2024-01-19 4:30 PM",
  },
  {
    id: "3",
    type: "phone",
    contact: "Sarah Mitchell (Adjuster)",
    summary: "Adjuster confirmed approval and discussed next steps for claim settlement.",
    timestamp: "2024-01-19 11:45 AM",
    duration: "8 min",
  },
  {
    id: "4",
    type: "text",
    contact: "John Smith",
    summary: "Follow-up about missing documentation. Client will send by end of day.",
    timestamp: "2024-01-18 2:20 PM",
  },
];

export const ClaimCommunications = ({ claimId }: { claimId: string }) => {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Communication Log</h3>
        <Button className="bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />
          Log Communication
        </Button>
      </div>

      <div className="space-y-3">
        {mockCommunications.map((comm) => (
          <div
            key={comm.id}
            className="p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${comm.type === "phone" ? "bg-primary/10" : "bg-accent/10"}`}>
                {comm.type === "phone" ? (
                  <Phone className="h-4 w-4 text-primary" />
                ) : (
                  <MessageSquare className="h-4 w-4 text-accent" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{comm.contact}</span>
                    <Badge variant="outline" className="text-xs">
                      {comm.type === "phone" ? "Call" : "Text"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {comm.duration && (
                      <span className="text-xs text-muted-foreground">{comm.duration}</span>
                    )}
                    <span className="text-xs text-muted-foreground">{comm.timestamp}</span>
                  </div>
                </div>
                <p className="text-sm text-foreground">{comm.summary}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
