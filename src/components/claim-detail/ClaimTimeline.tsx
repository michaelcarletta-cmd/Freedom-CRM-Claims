import { Clock, CheckCircle, AlertCircle, FileText } from "lucide-react";

interface TimelineEvent {
  id: string;
  type: "status" | "note" | "document" | "communication";
  title: string;
  description: string;
  timestamp: string;
  user: string;
}

// No mock timeline data - activity will be tracked dynamically
const mockTimeline: TimelineEvent[] = [];

const getEventIcon = (type: string) => {
  switch (type) {
    case "status":
      return CheckCircle;
    case "note":
      return FileText;
    case "document":
      return FileText;
    case "communication":
      return AlertCircle;
    default:
      return Clock;
  }
};

const getEventColor = (type: string) => {
  switch (type) {
    case "status":
      return "text-success";
    case "document":
      return "text-primary";
    case "communication":
      return "text-accent";
    default:
      return "text-muted-foreground";
  }
};

export const ClaimTimeline = ({ claimId }: { claimId: string }) => {
  if (mockTimeline.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        No activity recorded yet. Timeline will update as actions are taken on this claim.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        {mockTimeline.map((event, index) => {
          const Icon = getEventIcon(event.type);
          const isLast = index === mockTimeline.length - 1;

          return (
            <div key={event.id} className="relative pb-6">
              {!isLast && (
                <div className="absolute left-[11px] top-6 h-full w-px bg-border" />
              )}
              <div className="flex items-start gap-3">
                <div className={`p-1.5 rounded-full bg-card border-2 border-border ${getEventColor(event.type)}`}>
                  <Icon className="h-3 w-3" />
                </div>
                <div className="flex-1 pt-0.5">
                  <p className="text-sm font-medium text-foreground">{event.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{event.user}</span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground">{event.timestamp}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
