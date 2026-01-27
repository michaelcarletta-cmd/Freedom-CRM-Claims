import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Plus, Phone, Mail, FileText, Users, ArrowUpRight, ArrowDownLeft, Copy } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface CommunicationEntry {
  id: string;
  communication_date: string;
  communication_type: string;
  direction: string;
  contact_name: string | null;
  contact_title: string | null;
  contact_company: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  employee_id: string | null;
  summary: string;
  promises_made: string | null;
  deadlines_mentioned: string | null;
  follow_up_required: boolean;
  follow_up_date: string | null;
}

interface DarwinCommunicationsDiaryProps {
  claimId: string;
  claim: any;
}

const COMM_TYPES = [
  { value: "phone", label: "Phone Call", icon: Phone },
  { value: "email", label: "Email", icon: Mail },
  { value: "letter", label: "Letter/Mail", icon: FileText },
  { value: "in_person", label: "In Person", icon: Users },
  { value: "voicemail", label: "Voicemail", icon: Phone },
];

export const DarwinCommunicationsDiary = ({ claimId, claim }: DarwinCommunicationsDiaryProps) => {
  const [entries, setEntries] = useState<CommunicationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    communication_type: "phone",
    direction: "outbound",
    contact_name: "",
    contact_title: "",
    contact_company: "",
    contact_phone: "",
    contact_email: "",
    employee_id: "",
    summary: "",
    promises_made: "",
    deadlines_mentioned: "",
    follow_up_required: false,
    follow_up_date: "",
  });

  const fetchEntries = async () => {
    const { data, error } = await supabase
      .from("claim_communications_diary")
      .select("*")
      .eq("claim_id", claimId)
      .order("communication_date", { ascending: false });

    if (error) {
      console.error("Error fetching communications:", error);
    } else {
      setEntries(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEntries();
  }, [claimId]);

  const handleAddEntry = async () => {
    if (!formData.summary) {
      toast.error("Please provide a summary");
      return;
    }

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("claim_communications_diary").insert({
      claim_id: claimId,
      communication_date: new Date().toISOString(),
      communication_type: formData.communication_type,
      direction: formData.direction,
      contact_name: formData.contact_name || null,
      contact_title: formData.contact_title || null,
      contact_company: formData.contact_company || null,
      contact_phone: formData.contact_phone || null,
      contact_email: formData.contact_email || null,
      employee_id: formData.employee_id || null,
      summary: formData.summary,
      promises_made: formData.promises_made || null,
      deadlines_mentioned: formData.deadlines_mentioned || null,
      follow_up_required: formData.follow_up_required,
      follow_up_date: formData.follow_up_date || null,
      created_by: userData.user?.id,
    });

    if (error) {
      toast.error("Failed to add entry");
      console.error(error);
    } else {
      toast.success("Communication logged");
      setDialogOpen(false);
      setFormData({
        communication_type: "phone",
        direction: "outbound",
        contact_name: "",
        contact_title: "",
        contact_company: "",
        contact_phone: "",
        contact_email: "",
        employee_id: "",
        summary: "",
        promises_made: "",
        deadlines_mentioned: "",
        follow_up_required: false,
        follow_up_date: "",
      });
      fetchEntries();
    }
  };

  const generateTimeline = () => {
    const timeline = entries.map(e => {
      const commType = COMM_TYPES.find(t => t.value === e.communication_type);
      return `${format(new Date(e.communication_date), "MM/dd/yyyy HH:mm")} - ${e.direction === "outbound" ? "OUTBOUND" : "INBOUND"} ${commType?.label || e.communication_type}
Contact: ${e.contact_name || "Unknown"}${e.employee_id ? ` (ID: ${e.employee_id})` : ""}${e.contact_company ? ` - ${e.contact_company}` : ""}
Summary: ${e.summary}${e.promises_made ? `\nPromises Made: ${e.promises_made}` : ""}${e.deadlines_mentioned ? `\nDeadlines Mentioned: ${e.deadlines_mentioned}` : ""}
---`;
    }).join("\n\n");

    const fullDoc = `COMMUNICATIONS DIARY
Claim: ${claim?.claim_number || claimId}
Policyholder: ${claim?.policyholder_name || "Unknown"}
Generated: ${format(new Date(), "MM/dd/yyyy HH:mm")}

${timeline}`;

    navigator.clipboard.writeText(fullDoc);
    toast.success("Communications timeline copied to clipboard");
  };

  const getTypeIcon = (type: string) => {
    const commType = COMM_TYPES.find(t => t.value === type);
    const Icon = commType?.icon || MessageSquare;
    return <Icon className="h-4 w-4" />;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-indigo-600" />
              Communications Diary
            </CardTitle>
            <CardDescription>
              Log all adjuster interactions for bad faith documentation (PA/NJ)
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {entries.length > 0 && (
              <Button variant="outline" size="sm" onClick={generateTimeline}>
                <Copy className="h-4 w-4 mr-1" /> Export Timeline
              </Button>
            )}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" /> Log Communication
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Log Communication</DialogTitle>
                </DialogHeader>
                <ScrollArea className="max-h-[70vh]">
                  <div className="space-y-4 pr-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Type *</Label>
                        <Select
                          value={formData.communication_type}
                          onValueChange={(v) => setFormData({ ...formData, communication_type: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COMM_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Direction *</Label>
                        <Select
                          value={formData.direction}
                          onValueChange={(v) => setFormData({ ...formData, direction: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="outbound">Outbound (We called/wrote)</SelectItem>
                            <SelectItem value="inbound">Inbound (They called/wrote)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Contact Name</Label>
                        <Input
                          placeholder="John Smith"
                          value={formData.contact_name}
                          onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Employee ID</Label>
                        <Input
                          placeholder="EMP12345"
                          value={formData.employee_id}
                          onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Title/Role</Label>
                        <Input
                          placeholder="Claims Adjuster"
                          value={formData.contact_title}
                          onChange={(e) => setFormData({ ...formData, contact_title: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Company</Label>
                        <Input
                          placeholder="State Farm"
                          value={formData.contact_company}
                          onChange={(e) => setFormData({ ...formData, contact_company: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Summary of Conversation *</Label>
                      <Textarea
                        placeholder="Detailed notes about what was discussed..."
                        className="min-h-[100px]"
                        value={formData.summary}
                        onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Promises Made by Carrier</Label>
                      <Textarea
                        placeholder="Any commitments, timelines, or promises made..."
                        value={formData.promises_made}
                        onChange={(e) => setFormData({ ...formData, promises_made: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Deadlines Mentioned</Label>
                      <Input
                        placeholder="e.g., 'Will have decision by Friday'"
                        value={formData.deadlines_mentioned}
                        onChange={(e) => setFormData({ ...formData, deadlines_mentioned: e.target.value })}
                      />
                    </div>

                    <Button onClick={handleAddEntry} className="w-full">
                      Log Communication
                    </Button>
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No communications logged yet</p>
            <p className="text-sm">Document all interactions for potential bad faith claims</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-4">
              {entries.map((entry) => (
                <div key={entry.id} className="border rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${entry.direction === "outbound" ? "bg-blue-100" : "bg-green-100"}`}>
                      {getTypeIcon(entry.communication_type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">
                          {COMM_TYPES.find(t => t.value === entry.communication_type)?.label}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {entry.direction === "outbound" ? (
                            <><ArrowUpRight className="h-3 w-3 mr-1" /> Outbound</>
                          ) : (
                            <><ArrowDownLeft className="h-3 w-3 mr-1" /> Inbound</>
                          )}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(entry.communication_date), "MMM d, yyyy h:mm a")}
                        </span>
                      </div>
                      {entry.contact_name && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Contact: <span className="font-medium">{entry.contact_name}</span>
                          {entry.employee_id && <span> (ID: {entry.employee_id})</span>}
                          {entry.contact_company && <span> — {entry.contact_company}</span>}
                        </p>
                      )}
                      <p className="mt-2">{entry.summary}</p>
                      {entry.promises_made && (
                        <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                          <strong>Promises Made:</strong> {entry.promises_made}
                        </p>
                      )}
                      {entry.deadlines_mentioned && (
                        <p className="text-sm text-blue-700 dark:text-blue-400">
                          <strong>Deadlines:</strong> {entry.deadlines_mentioned}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
