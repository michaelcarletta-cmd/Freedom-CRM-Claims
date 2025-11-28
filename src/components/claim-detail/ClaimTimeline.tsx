import { Clock, CheckCircle, AlertCircle, FileText } from "lucide-react";

interface TimelineEvent {
  id: string;
  type: "status" | "note" | "document" | "communication";
  title: string;
  description: string;
  timestamp: string;
  user: string;
}

const mockTimeline: TimelineEvent[] = [
  {
    id: "1",
    type: "status",
    title: "Claim Approved",
    description: "Claim approved for $45,000",
    timestamp: "2024-01-19 11:20 AM",
    user: "Sarah Mitchell",
  },
  {
    id: "2",
    type: "communication",
    title: "Phone Call Logged",
    description: "Discussed repair timeline with client",
    timestamp: "2024-01-20 10:15 AM",
    user: "You",
  },
  {
    id: "3",
    type: "document",
    title: "Document Uploaded",
    description: "Repair_Estimate.pdf uploaded",
    timestamp: "2024-01-18 2:00 PM",
    user: "Contractor",
  },
  {
    id: "4",
    type: "note",
    title: "Note Added",
    description: "Adjuster visited property",
    timestamp: "2024-01-18 2:15 PM",
    user: "Sarah Mitchell",
  },
  {
    id: "5",
    type: "status",
    title: "Status Changed",
    description: "Changed to Under Review",
    timestamp: "2024-01-17 9:30 AM",
    user: "You",
  },
  {
    id: "6",
    type: "document",
    title: "Photos Uploaded",
    description: "2 damage photos added",
    timestamp: "2024-01-15 3:45 PM",
    user: "John Smith",
  },
  {
    id: "7",
    type: "status",
    title: "Claim Created",
    description: "New claim submitted",
    timestamp: "2024-01-15 10:30 AM",
    user: "You",
  },
];

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
