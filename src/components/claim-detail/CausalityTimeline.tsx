import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  CloudRain, 
  FileText, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight,
  Phone,
  Mail,
  Calendar,
  DollarSign,
  XCircle
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";

interface CausalityTimelineProps {
  claimId: string;
  claim: any;
  deadlines?: any[];
}

interface TimelineEvent {
  id: string;
  date: Date;
  type: 'loss' | 'filed' | 'inspection' | 'communication' | 'deadline' | 'payment' | 'denial' | 'supplement' | 'violation';
  title: string;
  description?: string;
  consequence?: string;
  violationType?: string;
  isNegative?: boolean;
  isPositive?: boolean;
}

export const CausalityTimeline = ({ claimId, claim, deadlines = [] }: CausalityTimelineProps) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTimelineData();
  }, [claimId]);

  const loadTimelineData = async () => {
    setLoading(true);
    try {
      const [
        inspectionsResult,
        emailsResult,
        checksResult,
        diaryResult
      ] = await Promise.all([
        supabase.from('inspections').select('*').eq('claim_id', claimId),
        supabase.from('emails').select('*').eq('claim_id', claimId).order('created_at', { ascending: true }),
        supabase.from('claim_checks').select('*').eq('claim_id', claimId),
        supabase.from('claim_communications_diary').select('*').eq('claim_id', claimId)
      ]);

      const timelineEvents: TimelineEvent[] = [];

      // Add loss date as the origin event
      if (claim?.loss_date) {
        timelineEvents.push({
          id: 'loss-date',
          date: new Date(claim.loss_date),
          type: 'loss',
          title: 'Loss Event',
          description: claim.loss_type || 'Property damage occurred',
          consequence: 'Claim clock starts'
        });
      }

      // Add claim filed date
      if (claim?.created_at) {
        timelineEvents.push({
          id: 'claim-filed',
          date: new Date(claim.created_at),
          type: 'filed',
          title: 'Claim Filed',
          description: `Claim #${claim.claim_number} submitted`,
          consequence: 'Carrier acknowledgment deadline triggered'
        });
      }

      // Add inspections
      inspectionsResult.data?.forEach(insp => {
        timelineEvents.push({
          id: `insp-${insp.id}`,
          date: new Date(insp.inspection_date),
          type: 'inspection',
          title: `${insp.inspection_type || 'Inspection'} - ${insp.status}`,
          description: insp.inspector_name ? `By ${insp.inspector_name}` : undefined,
          isPositive: insp.status === 'completed'
        });
      });

      // Add key emails (denials, approvals)
      emailsResult.data?.forEach(email => {
        const subject = email.subject?.toLowerCase() || '';
        if (subject.includes('denial') || subject.includes('denied')) {
          timelineEvents.push({
            id: `email-${email.id}`,
            date: new Date(email.created_at),
            type: 'denial',
            title: 'Denial Received',
            description: email.subject,
            consequence: 'Rebuttal opportunity',
            isNegative: true
          });
        }
      });

      // Add payments
      checksResult.data?.forEach(check => {
        timelineEvents.push({
          id: `check-${check.id}`,
          date: new Date(check.check_date),
          type: 'payment',
          title: `Payment Received: $${check.amount?.toLocaleString()}`,
          description: check.check_type,
          isPositive: true
        });
      });

      // Add deadline violations
      deadlines.forEach(deadline => {
        if (deadline.days_overdue && deadline.days_overdue > 0) {
          timelineEvents.push({
            id: `deadline-${deadline.id}`,
            date: new Date(deadline.deadline_date),
            type: 'violation',
            title: `${deadline.deadline_type} Deadline Missed`,
            description: `${deadline.days_overdue} days overdue`,
            consequence: deadline.bad_faith_potential ? 'Bad faith indicator' : 'Leverage opportunity',
            violationType: deadline.deadline_type,
            isNegative: true
          });
        }
      });

      // Sort by date
      timelineEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Add causality chains
      const eventsWithCausality = addCausalityChains(timelineEvents);
      
      setEvents(eventsWithCausality);
    } catch (error) {
      console.error("Error loading timeline:", error);
    } finally {
      setLoading(false);
    }
  };

  const addCausalityChains = (events: TimelineEvent[]): TimelineEvent[] => {
    // Add consequence chains between events
    const result = [...events];
    
    // Find violation events and link back to trigger
    result.forEach((event, i) => {
      if (event.type === 'violation') {
        // Find the triggering event
        const triggerEvent = result.slice(0, i).reverse().find(e => 
          e.type === 'filed' || e.type === 'inspection' || e.type === 'loss'
        );
        if (triggerEvent && !event.consequence) {
          event.consequence = `Carrier violated deadline from ${format(triggerEvent.date, 'MMM d')}`;
        }
      }
    });

    return result;
  };

  const getEventIcon = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'loss': return <CloudRain className="h-4 w-4" />;
      case 'filed': return <FileText className="h-4 w-4" />;
      case 'inspection': return <Calendar className="h-4 w-4" />;
      case 'communication': return <Mail className="h-4 w-4" />;
      case 'deadline': return <Clock className="h-4 w-4" />;
      case 'payment': return <DollarSign className="h-4 w-4" />;
      case 'denial': return <XCircle className="h-4 w-4" />;
      case 'violation': return <AlertTriangle className="h-4 w-4" />;
      default: return <CheckCircle2 className="h-4 w-4" />;
    }
  };

  const getEventColor = (event: TimelineEvent) => {
    if (event.isNegative) return 'border-red-500 bg-red-50 dark:bg-red-950/30';
    if (event.isPositive) return 'border-green-500 bg-green-50 dark:bg-green-950/30';
    if (event.type === 'loss') return 'border-blue-500 bg-blue-50 dark:bg-blue-950/30';
    if (event.type === 'violation') return 'border-orange-500 bg-orange-50 dark:bg-orange-950/30';
    return 'border-muted bg-muted/30';
  };

  const getIconColor = (event: TimelineEvent) => {
    if (event.isNegative || event.type === 'denial') return 'text-red-600';
    if (event.isPositive || event.type === 'payment') return 'text-green-600';
    if (event.type === 'loss') return 'text-blue-600';
    if (event.type === 'violation') return 'text-orange-600';
    return 'text-muted-foreground';
  };

  if (loading) {
    return <div className="text-center text-muted-foreground text-sm">Loading timeline...</div>;
  }

  if (events.length === 0) {
    return <div className="text-center text-muted-foreground text-sm">No timeline events found</div>;
  }

  return (
    <ScrollArea className="h-[260px]">
      <div className="relative pl-6">
        {/* Timeline line */}
        <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-muted" />

        {events.map((event, i) => (
          <div key={event.id} className="relative mb-4 last:mb-0">
            {/* Timeline dot */}
            <div className={cn(
              "absolute -left-4 w-4 h-4 rounded-full border-2 flex items-center justify-center bg-background",
              event.isNegative ? "border-red-500" : event.isPositive ? "border-green-500" : "border-primary"
            )}>
              <div className={cn(
                "w-2 h-2 rounded-full",
                event.isNegative ? "bg-red-500" : event.isPositive ? "bg-green-500" : "bg-primary"
              )} />
            </div>

            {/* Event card */}
            <div className={cn(
              "ml-4 p-2 rounded-lg border text-xs",
              getEventColor(event)
            )}>
              <div className="flex items-start gap-2">
                <div className={cn("mt-0.5 flex-shrink-0", getIconColor(event))}>
                  {getEventIcon(event.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{event.title}</span>
                    <span className="text-muted-foreground">{format(event.date, 'MMM d, yyyy')}</span>
                  </div>
                  {event.description && (
                    <p className="text-muted-foreground mt-0.5">{event.description}</p>
                  )}
                  {event.consequence && (
                    <div className="flex items-center gap-1 mt-1 text-primary font-medium">
                      <ArrowRight className="h-3 w-3" />
                      {event.consequence}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};
