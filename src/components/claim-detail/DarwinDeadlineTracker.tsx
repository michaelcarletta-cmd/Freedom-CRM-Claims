import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Clock, AlertTriangle, CheckCircle, RefreshCw, Calendar, Loader2 } from "lucide-react";
import { format, differenceInDays, isPast, addDays } from "date-fns";

interface DeadlineTrackerProps {
  claimId: string;
  claim: any;
}

interface Deadline {
  id: string;
  deadline_type: string;
  deadline_date: string;
  status: string;
  state_code: string;
  regulation_reference: string | null;
  notes: string | null;
  triggered_at: string | null;
}

const DEADLINE_TYPES = {
  acknowledgment: { label: "Acknowledgment", daysNJ: 10, daysPA: 10 },
  investigation: { label: "Investigation", daysNJ: 30, daysPA: 30 },
  response: { label: "Written Response", daysNJ: 10, daysPA: 15 },
  payment: { label: "Payment", daysNJ: 10, daysPA: 10 },
  statute_of_limitations: { label: "Statute of Limitations", daysNJ: 365 * 6, daysPA: 365 * 2 },
  appraisal_demand: { label: "Appraisal Demand Response", daysNJ: 20, daysPA: 20 },
};

export function DarwinDeadlineTracker({ claimId, claim }: DeadlineTrackerProps) {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const detectState = (address: string | null): string => {
    if (!address) return "NJ";
    const upperAddress = address.toUpperCase();
    if (upperAddress.includes(" PA") || upperAddress.includes("PENNSYLVANIA") || upperAddress.includes(", PA")) {
      return "PA";
    }
    return "NJ";
  };

  const stateCode = detectState(claim.policyholder_address);

  useEffect(() => {
    fetchDeadlines();
  }, [claimId]);

  const fetchDeadlines = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("claim_deadlines")
        .select("*")
        .eq("claim_id", claimId)
        .order("deadline_date", { ascending: true });

      if (error) throw error;
      setDeadlines(data || []);
    } catch (error: any) {
      console.error("Error fetching deadlines:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateDeadlines = async () => {
    setIsGenerating(true);
    try {
      const lossDate = claim.loss_date ? new Date(claim.loss_date) : new Date(claim.created_at);
      const claimFiledDate = new Date(claim.created_at);
      
      const newDeadlines = [];
      const isPA = stateCode === "PA";

      // Acknowledgment deadline (10 working days from claim filed)
      newDeadlines.push({
        claim_id: claimId,
        deadline_type: "acknowledgment",
        deadline_date: format(addDays(claimFiledDate, isPA ? 10 : 10), "yyyy-MM-dd"),
        status: "pending",
        state_code: stateCode,
        regulation_reference: isPA ? "31 Pa. Code § 146.5" : "N.J.A.C. 11:2-17.6",
        triggered_at: claimFiledDate.toISOString(),
      });

      // Investigation deadline (30 days from acknowledgment)
      newDeadlines.push({
        claim_id: claimId,
        deadline_type: "investigation",
        deadline_date: format(addDays(claimFiledDate, isPA ? 30 : 30), "yyyy-MM-dd"),
        status: "pending",
        state_code: stateCode,
        regulation_reference: isPA ? "31 Pa. Code § 146.6" : "N.J.A.C. 11:2-17.7",
        triggered_at: claimFiledDate.toISOString(),
      });

      // Written response deadline
      newDeadlines.push({
        claim_id: claimId,
        deadline_type: "response",
        deadline_date: format(addDays(claimFiledDate, isPA ? 45 : 40), "yyyy-MM-dd"),
        status: "pending",
        state_code: stateCode,
        regulation_reference: isPA ? "31 Pa. Code § 146.7" : "N.J.A.C. 11:2-17.8",
        triggered_at: claimFiledDate.toISOString(),
      });

      // Statute of limitations (from loss date)
      newDeadlines.push({
        claim_id: claimId,
        deadline_type: "statute_of_limitations",
        deadline_date: format(addDays(lossDate, isPA ? 365 * 2 : 365 * 6), "yyyy-MM-dd"),
        status: "pending",
        state_code: stateCode,
        regulation_reference: isPA ? "42 Pa.C.S. § 5525" : "N.J.S.A. 2A:14-1",
        triggered_at: lossDate.toISOString(),
        notes: `Based on loss date: ${format(lossDate, "MM/dd/yyyy")}`,
      });

      // Insert all deadlines
      const { error } = await supabase.from("claim_deadlines").insert(newDeadlines);

      if (error) throw error;

      toast({ title: "Deadlines Generated", description: `Created ${newDeadlines.length} regulatory deadlines for ${stateCode}` });
      fetchDeadlines();
    } catch (error: any) {
      console.error("Error generating deadlines:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const updateDeadlineStatus = async (deadlineId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("claim_deadlines")
        .update({ 
          status: newStatus, 
          resolved_at: newStatus === "met" || newStatus === "waived" ? new Date().toISOString() : null 
        })
        .eq("id", deadlineId);

      if (error) throw error;
      
      setDeadlines(prev => prev.map(d => 
        d.id === deadlineId ? { ...d, status: newStatus } : d
      ));
      
      toast({ title: "Status Updated" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const getDeadlineStatus = (deadline: Deadline) => {
    if (deadline.status === "met") return { color: "bg-green-500", icon: CheckCircle, label: "Met" };
    if (deadline.status === "waived") return { color: "bg-muted", icon: CheckCircle, label: "Waived" };
    if (deadline.status === "missed") return { color: "bg-destructive", icon: AlertTriangle, label: "Missed" };
    
    const daysUntil = differenceInDays(new Date(deadline.deadline_date), new Date());
    if (isPast(new Date(deadline.deadline_date))) return { color: "bg-destructive", icon: AlertTriangle, label: "Overdue" };
    if (daysUntil <= 5) return { color: "bg-amber-500", icon: Clock, label: `${daysUntil}d left` };
    return { color: "bg-primary", icon: Calendar, label: `${daysUntil}d left` };
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Regulatory Deadline Tracker</CardTitle>
            <Badge variant="outline">{stateCode}</Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchDeadlines} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {deadlines.length === 0 && (
              <Button size="sm" onClick={generateDeadlines} disabled={isGenerating}>
                {isGenerating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Calendar className="h-4 w-4 mr-1" />}
                Generate Deadlines
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : deadlines.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No deadlines tracked yet.</p>
            <p className="text-sm">Click "Generate Deadlines" to auto-calculate based on {stateCode} regulations.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {deadlines.map((deadline) => {
              const status = getDeadlineStatus(deadline);
              const StatusIcon = status.icon;
              
              return (
                <div key={deadline.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${status.color}`} />
                    <div>
                      <div className="font-medium">
                        {DEADLINE_TYPES[deadline.deadline_type as keyof typeof DEADLINE_TYPES]?.label || deadline.deadline_type}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Due: {format(new Date(deadline.deadline_date), "MMM d, yyyy")}
                        {deadline.regulation_reference && (
                          <span className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded">
                            {deadline.regulation_reference}
                          </span>
                        )}
                      </div>
                      {deadline.notes && (
                        <div className="text-xs text-muted-foreground mt-0.5">{deadline.notes}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={deadline.status === "met" ? "default" : deadline.status === "missed" ? "destructive" : "secondary"}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {status.label}
                    </Badge>
                    {deadline.status === "pending" && (
                      <Button variant="ghost" size="sm" onClick={() => updateDeadlineStatus(deadline.id, "met")}>
                        Mark Met
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DarwinDeadlineTracker;
