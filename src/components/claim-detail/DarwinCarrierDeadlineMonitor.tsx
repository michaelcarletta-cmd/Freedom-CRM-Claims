import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Plus, AlertTriangle, CheckCircle, XCircle, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { format, addDays, addBusinessDays, differenceInDays, isPast } from "date-fns";

interface CarrierDeadline {
  id: string;
  claim_id: string;
  deadline_type: string;
  trigger_date: string;
  trigger_description: string;
  deadline_date: string;
  is_business_days: boolean;
  status: string;
  carrier_response_date: string | null;
  carrier_response_summary: string | null;
  days_overdue: number | null;
  bad_faith_potential: boolean;
  notes: string | null;
}

interface DarwinCarrierDeadlineMonitorProps {
  claimId: string;
  claim: any;
}

const DEADLINE_TYPES = [
  { value: "acknowledgment", label: "Claim Acknowledgment", defaultDays: 10, isBusinessDays: true },
  { value: "investigation", label: "Investigation Complete", defaultDays: 30, isBusinessDays: false },
  { value: "decision", label: "Claim Decision", defaultDays: 15, isBusinessDays: true },
  { value: "payment", label: "Payment Due", defaultDays: 30, isBusinessDays: false },
  { value: "pol_response", label: "POL Response", defaultDays: 30, isBusinessDays: false },
];

export const DarwinCarrierDeadlineMonitor = ({ claimId, claim }: DarwinCarrierDeadlineMonitorProps) => {
  const [deadlines, setDeadlines] = useState<CarrierDeadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    deadline_type: "",
    trigger_date: format(new Date(), "yyyy-MM-dd"),
    trigger_description: "",
    notes: "",
  });

  const fetchDeadlines = async () => {
    const { data, error } = await supabase
      .from("claim_carrier_deadlines")
      .select("*")
      .eq("claim_id", claimId)
      .order("deadline_date", { ascending: true });

    if (error) {
      console.error("Error fetching deadlines:", error);
    } else {
      // Update overdue status
      const updated = (data || []).map(d => {
        const deadlineDate = new Date(d.deadline_date);
        const isOverdue = isPast(deadlineDate) && d.status === "pending";
        const daysOverdue = isOverdue ? differenceInDays(new Date(), deadlineDate) : 0;
        return {
          ...d,
          days_overdue: daysOverdue,
          bad_faith_potential: daysOverdue > 0
        };
      });
      setDeadlines(updated);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDeadlines();
  }, [claimId]);

  const handleAddDeadline = async () => {
    if (!formData.deadline_type || !formData.trigger_date) {
      toast.error("Please fill in required fields");
      return;
    }

    const deadlineConfig = DEADLINE_TYPES.find(d => d.value === formData.deadline_type);
    if (!deadlineConfig) return;

    const triggerDate = new Date(formData.trigger_date);
    const deadlineDate = deadlineConfig.isBusinessDays
      ? addBusinessDays(triggerDate, deadlineConfig.defaultDays)
      : addDays(triggerDate, deadlineConfig.defaultDays);

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("claim_carrier_deadlines").insert({
      claim_id: claimId,
      deadline_type: formData.deadline_type,
      trigger_date: formData.trigger_date,
      trigger_description: formData.trigger_description || deadlineConfig.label,
      deadline_date: format(deadlineDate, "yyyy-MM-dd"),
      is_business_days: deadlineConfig.isBusinessDays,
      status: "pending",
      notes: formData.notes,
      created_by: userData.user?.id,
    });

    if (error) {
      toast.error("Failed to add deadline");
      console.error(error);
    } else {
      toast.success("Deadline added");
      setDialogOpen(false);
      setFormData({
        deadline_type: "",
        trigger_date: format(new Date(), "yyyy-MM-dd"),
        trigger_description: "",
        notes: "",
      });
      fetchDeadlines();
    }
  };

  const updateDeadlineStatus = async (id: string, status: string, responseDate?: string, responseSummary?: string) => {
    const updateData: any = { status };
    if (responseDate) updateData.carrier_response_date = responseDate;
    if (responseSummary) updateData.carrier_response_summary = responseSummary;

    const { error } = await supabase
      .from("claim_carrier_deadlines")
      .update(updateData)
      .eq("id", id);

    if (error) {
      toast.error("Failed to update deadline");
    } else {
      toast.success("Deadline updated");
      fetchDeadlines();
    }
  };

  const getStatusBadge = (deadline: CarrierDeadline) => {
    if (deadline.status === "met") {
      return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" /> Met</Badge>;
    }
    if (deadline.status === "missed" || (deadline.days_overdue && deadline.days_overdue > 0)) {
      return (
        <Badge className="bg-red-100 text-red-800">
          <XCircle className="h-3 w-3 mr-1" /> 
          {deadline.days_overdue} days overdue
        </Badge>
      );
    }
    const daysLeft = differenceInDays(new Date(deadline.deadline_date), new Date());
    if (daysLeft <= 5 && daysLeft > 0) {
      return <Badge className="bg-amber-100 text-amber-800"><AlertTriangle className="h-3 w-3 mr-1" /> {daysLeft} days left</Badge>;
    }
    return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> {daysLeft} days</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-blue-600" />
              Carrier Deadline Monitor
            </CardTitle>
            <CardDescription>
              Track PA/NJ statutory response deadlines and bad faith triggers
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add Deadline
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Carrier Deadline</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Deadline Type *</Label>
                  <Select
                    value={formData.deadline_type}
                    onValueChange={(v) => setFormData({ ...formData, deadline_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select deadline type" />
                    </SelectTrigger>
                    <SelectContent>
                      {DEADLINE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label} ({type.defaultDays} {type.isBusinessDays ? "business" : "calendar"} days)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Trigger Date * (when clock started)</Label>
                  <Input
                    type="date"
                    value={formData.trigger_date}
                    onChange={(e) => setFormData({ ...formData, trigger_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Trigger Description</Label>
                  <Input
                    placeholder="e.g., POL submitted via certified mail"
                    value={formData.trigger_description}
                    onChange={(e) => setFormData({ ...formData, trigger_description: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Additional notes..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
                <Button onClick={handleAddDeadline} className="w-full">
                  Add Deadline
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : deadlines.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CalendarClock className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No deadlines tracked yet</p>
            <p className="text-sm">Add deadlines to monitor carrier response times</p>
          </div>
        ) : (
          <div className="space-y-3">
            {deadlines.map((deadline) => (
              <div
                key={deadline.id}
                className={`border rounded-lg p-4 ${
                  deadline.bad_faith_potential ? "border-red-300 bg-red-50 dark:bg-red-950/20" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {DEADLINE_TYPES.find(t => t.value === deadline.deadline_type)?.label || deadline.deadline_type}
                      </span>
                      {getStatusBadge(deadline)}
                      {deadline.bad_faith_potential && (
                        <Badge className="bg-red-600 text-white">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Bad Faith Potential
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Triggered: {format(new Date(deadline.trigger_date), "MMM d, yyyy")} — {deadline.trigger_description}
                    </p>
                    <p className="text-sm font-medium mt-1">
                      Deadline: {format(new Date(deadline.deadline_date), "MMM d, yyyy")}
                      {deadline.is_business_days && " (business days)"}
                    </p>
                    {deadline.carrier_response_date && (
                      <p className="text-sm text-green-700 dark:text-green-400 mt-1">
                        ✓ Carrier responded: {format(new Date(deadline.carrier_response_date), "MMM d, yyyy")}
                      </p>
                    )}
                  </div>
                  {deadline.status === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateDeadlineStatus(deadline.id, "met", format(new Date(), "yyyy-MM-dd"))}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" /> Mark Met
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => updateDeadlineStatus(deadline.id, "missed")}
                      >
                        <XCircle className="h-4 w-4 mr-1" /> Missed
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
