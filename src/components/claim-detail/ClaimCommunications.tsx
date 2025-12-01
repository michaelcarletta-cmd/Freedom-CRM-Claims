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

// No mock data - all communications will be logged by users
const communications: Communication[] = [];

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

      {communications.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No communications logged yet. Click "Log Communication" to add one.
        </div>
      ) : (
        <div className="space-y-3">
          {communications.map((comm) => (
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
      )}
    </div>
  );
};
