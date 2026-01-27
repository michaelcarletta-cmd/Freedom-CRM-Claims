import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Calendar, 
  Loader2,
  FileText,
  Mail,
  Camera,
  ClipboardCheck,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Phone,
  MessageSquare,
  Eye,
  CloudRain,
  Gavel,
  Filter
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInDays, isToday, isTomorrow, isPast } from "date-fns";

interface VisualClaimTimelineProps {
  claimId: string;
  claim?: any;
}

type EventType = "milestone" | "inspection" | "document" | "communication" | "payment" | "task" | "photo" | "note";

interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  type: EventType;
  status: "completed" | "pending" | "upcoming" | "overdue";
  icon: any;
  metadata?: Record<string, any>;
}

const EVENT_TYPE_CONFIG: Record<EventType, { icon: any; color: string; bgColor: string }> = {
  milestone: { icon: Gavel, color: "text-purple-600", bgColor: "bg-purple-100 dark:bg-purple-900" },
  inspection: { icon: Eye, color: "text-blue-600", bgColor: "bg-blue-100 dark:bg-blue-900" },
  document: { icon: FileText, color: "text-orange-600", bgColor: "bg-orange-100 dark:bg-orange-900" },
  communication: { icon: Mail, color: "text-green-600", bgColor: "bg-green-100 dark:bg-green-900" },
  payment: { icon: DollarSign, color: "text-emerald-600", bgColor: "bg-emerald-100 dark:bg-emerald-900" },
  task: { icon: ClipboardCheck, color: "text-amber-600", bgColor: "bg-amber-100 dark:bg-amber-900" },
  photo: { icon: Camera, color: "text-pink-600", bgColor: "bg-pink-100 dark:bg-pink-900" },
  note: { icon: MessageSquare, color: "text-slate-600", bgColor: "bg-slate-100 dark:bg-slate-900" },
};

export const VisualClaimTimeline = ({ claimId, claim }: VisualClaimTimelineProps) => {
  const [isOpen, setIsOpen] = useState(true);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<EventType | "all">("all");

  useEffect(() => {
    fetchTimelineEvents();
  }, [claimId]);

  const fetchTimelineEvents = async () => {
    setLoading(true);
    try {
      const timelineEvents: TimelineEvent[] = [];
      const today = new Date();

      // Fetch tasks
      const { data: tasks } = await supabase
        .from("tasks")
        .select("*")
        .eq("claim_id", claimId)
        .order("due_date");

      // Fetch inspections
      const { data: inspections } = await supabase
        .from("inspections")
        .select("*")
        .eq("claim_id", claimId)
        .order("inspection_date");

      // Fetch emails
      const { data: emails } = await supabase
        .from("emails")
        .select("*")
        .eq("claim_id", claimId)
        .order("sent_at", { ascending: false })
        .limit(10);

      // Fetch checks
      const { data: checks } = await supabase
        .from("claim_checks")
        .select("*")
        .eq("claim_id", claimId)
        .order("check_date");

      // Fetch files
      const { data: files } = await supabase
        .from("claim_files")
        .select("*")
        .eq("claim_id", claimId)
        .order("uploaded_at", { ascending: false })
        .limit(5);

      // Fetch photos
      const { data: photos } = await supabase
        .from("claim_photos")
        .select("*")
        .eq("claim_id", claimId)
        .order("created_at", { ascending: false })
        .limit(5);

      // Fetch communication diary
      const { data: diaryEntries } = await supabase
        .from("claim_communications_diary")
        .select("*")
        .eq("claim_id", claimId)
        .order("communication_date", { ascending: false })
        .limit(5);

      // Add claim creation milestone
      if (claim) {
        timelineEvents.push({
          id: "claim-created",
          title: "Claim Created",
          description: `${claim.claim_number || "New claim"} opened for ${claim.loss_type || "property damage"}`,
          date: claim.created_at,
          type: "milestone",
          status: "completed",
          icon: Gavel,
        });

        // Add loss date milestone
        if (claim.loss_date) {
          timelineEvents.push({
            id: "loss-date",
            title: "Date of Loss",
            description: `${claim.loss_type || "Damage"} occurred at ${claim.policyholder_address || "property"}`,
            date: claim.loss_date,
            type: "milestone",
            status: "completed",
            icon: CloudRain,
          });
        }
      }

      // Add inspections
      inspections?.forEach((insp) => {
        const inspDate = new Date(insp.inspection_date);
        let status: TimelineEvent["status"] = "pending";
        if (insp.status === "completed") status = "completed";
        else if (isPast(inspDate) && !isToday(inspDate)) status = "overdue";
        else if (isToday(inspDate) || isTomorrow(inspDate) || differenceInDays(inspDate, today) <= 7) status = "upcoming";

        timelineEvents.push({
          id: `insp-${insp.id}`,
          title: `${insp.inspection_type || "Inspection"} ${status === "completed" ? "Completed" : "Scheduled"}`,
          description: insp.inspector_name ? `Inspector: ${insp.inspector_name}` : "Property inspection",
          date: insp.inspection_date,
          type: "inspection",
          status,
          icon: Eye,
        });
      });

      // Add tasks
      tasks?.forEach((task) => {
        let status: TimelineEvent["status"] = "pending";
        if (task.status === "completed") status = "completed";
        else if (task.due_date && isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date))) status = "overdue";
        else if (task.due_date && (isToday(new Date(task.due_date)) || isTomorrow(new Date(task.due_date)) || differenceInDays(new Date(task.due_date), today) <= 3)) status = "upcoming";

        timelineEvents.push({
          id: `task-${task.id}`,
          title: task.title,
          description: task.description || "Task pending",
          date: task.due_date || task.created_at,
          type: "task",
          status,
          icon: ClipboardCheck,
          metadata: { priority: task.priority },
        });
      });

      // Add checks received
      checks?.forEach((check) => {
        timelineEvents.push({
          id: `check-${check.id}`,
          title: `Check Received: $${Number(check.amount).toLocaleString()}`,
          description: `${check.check_type} - Check #${check.check_number || "N/A"}`,
          date: check.received_date || check.check_date,
          type: "payment",
          status: "completed",
          icon: DollarSign,
        });
      });

      // Add emails
      emails?.forEach((email) => {
        timelineEvents.push({
          id: `email-${email.id}`,
          title: email.subject || "Email",
          description: `To: ${email.recipient_name || email.recipient_email}`,
          date: email.sent_at,
          type: "communication",
          status: "completed",
          icon: Mail,
        });
      });

      // Add files
      files?.forEach((file) => {
        timelineEvents.push({
          id: `file-${file.id}`,
          title: `Document Uploaded`,
          description: file.file_name,
          date: file.uploaded_at,
          type: "document",
          status: "completed",
          icon: FileText,
        });
      });

      // Add photos
      photos?.forEach((photo) => {
        timelineEvents.push({
          id: `photo-${photo.id}`,
          title: "Photo Added",
          description: photo.description || photo.file_name,
          date: photo.created_at,
          type: "photo",
          status: "completed",
          icon: Camera,
        });
      });

      // Add communication diary entries
      diaryEntries?.forEach((entry) => {
        timelineEvents.push({
          id: `diary-${entry.id}`,
          title: `${entry.communication_type} - ${entry.direction}`,
          description: entry.summary?.substring(0, 80) + "..." || "Communication logged",
          date: entry.communication_date,
          type: "communication",
          status: "completed",
          icon: entry.communication_type === "phone" ? Phone : Mail,
        });
      });

      // Sort by date (newest first)
      timelineEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setEvents(timelineEvents);
    } catch (error) {
      console.error("Error fetching timeline data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusStyle = (status: TimelineEvent["status"]) => {
    switch (status) {
      case "completed": return "border-l-success bg-success/10";
      case "overdue": return "border-l-destructive bg-destructive/10";
      case "upcoming": return "border-l-warning bg-warning/10";
      default: return "border-l-primary bg-primary/10";
    }
  };

  const getStatusBadge = (status: TimelineEvent["status"]) => {
    switch (status) {
      case "completed": return <Badge className="bg-success/20 text-success-foreground border-success/30">Completed</Badge>;
      case "overdue": return <Badge variant="destructive">Overdue</Badge>;
      case "upcoming": return <Badge className="bg-warning/20 text-warning-foreground border-warning/30">Upcoming</Badge>;
      default: return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const filteredEvents = filter === "all" ? events : events.filter(e => e.type === filter);

  // Stats
  const overdueCount = events.filter(e => e.status === "overdue").length;
  const upcomingCount = events.filter(e => e.status === "upcoming").length;
  const completedCount = events.filter(e => e.status === "completed").length;
  const pendingCount = events.filter(e => e.status === "pending").length;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Visual Claim Timeline
                <Badge variant="secondary" className="ml-2">Audit-Ready</Badge>
              </CardTitle>
              <div className="flex items-center gap-3">
                {overdueCount > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {overdueCount} overdue
                  </Badge>
                )}
                {upcomingCount > 0 && (
                  <Badge className="bg-warning/20 text-warning-foreground border-warning/30 text-xs">
                    {upcomingCount} upcoming
                  </Badge>
                )}
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-2">
              <div className="flex items-center gap-2 p-2 rounded-md bg-success/10 border border-success/20">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <span className="text-sm font-medium text-foreground">{completedCount} Done</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-md bg-primary/10 border border-primary/20">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">{pendingCount} Pending</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-md bg-warning/10 border border-warning/20">
                <Calendar className="h-4 w-4 text-warning" />
                <span className="text-sm font-medium text-foreground">{upcomingCount} Soon</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium text-foreground">{overdueCount} Overdue</span>
              </div>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Button 
                variant={filter === "all" ? "default" : "outline"} 
                size="sm"
                onClick={() => setFilter("all")}
              >
                All
              </Button>
              {(Object.keys(EVENT_TYPE_CONFIG) as EventType[]).map(type => (
                <Button
                  key={type}
                  variant={filter === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(type)}
                  className="capitalize"
                >
                  {type}
                </Button>
              ))}
            </div>

            {/* Timeline */}
            <ScrollArea className="h-[400px] pr-4">
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

                <div className="space-y-4">
                  {filteredEvents.map((event) => {
                    const config = EVENT_TYPE_CONFIG[event.type];
                    const IconComponent = config.icon;

                    return (
                      <div key={event.id} className="relative pl-10">
                        {/* Icon circle on timeline */}
                        <div className={`absolute left-0 w-8 h-8 rounded-full flex items-center justify-center ${config.bgColor} border-2 border-background shadow-sm`}>
                          <IconComponent className={`h-4 w-4 ${config.color}`} />
                        </div>

                        {/* Event card */}
                        <div className={`p-3 rounded-lg border-l-4 ${getStatusStyle(event.status)} transition-all hover:shadow-md`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{event.title}</span>
                                {getStatusBadge(event.status)}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {event.description}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs font-medium">
                                {format(new Date(event.date), "MMM d, yyyy")}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(event.date), "h:mm a")}
                              </p>
                            </div>
                          </div>

                          {/* Additional metadata */}
                          {event.metadata?.priority && (
                            <Badge variant="outline" className="mt-2 text-xs">
                              Priority: {event.metadata.priority}
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {filteredEvents.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No {filter === "all" ? "timeline events" : `${filter} events`} found</p>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
