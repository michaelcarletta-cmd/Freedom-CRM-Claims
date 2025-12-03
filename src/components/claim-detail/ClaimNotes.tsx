import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { Plus, Send, Bot, MessageSquare, Loader2, Edit, Trash2, FileText, Cloud, Camera, Calculator } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";

interface Update {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  recipients: any;
  profiles: {
    full_name: string | null;
    email: string;
  } | null;
}

interface Claim {
  client_id: string | null;
  referrer_id: string | null;
  claim_contractors: { contractor_id: string }[];
  policyholder_email: string | null;
  policyholder_name: string;
}

interface AiMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export const ClaimNotes = ({ claimId }: { claimId: string }) => {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [newUpdate, setNewUpdate] = useState("");
  const [useCustomTimestamp, setUseCustomTimestamp] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [claim, setClaim] = useState<Claim | null>(null);
  const [notifyClient, setNotifyClient] = useState(false);
  const [notifyReferrer, setNotifyReferrer] = useState(false);
  const [notifyContractors, setNotifyContractors] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingUpdate, setEditingUpdate] = useState<Update | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Update | null>(null);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState<string | null>(null);
  const { user, userRole } = useAuth();
  const isStaff = userRole === "admin" || userRole === "staff";

  useEffect(() => {
    fetchUpdates();
    fetchClaim();

    const channel = supabase
      .channel("claim-updates-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "claim_updates",
          filter: `claim_id=eq.${claimId}`,
        },
        () => {
          fetchUpdates();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [claimId]);

  const fetchClaim = async () => {
    const { data } = await supabase
      .from("claims")
      .select(`
        client_id,
        referrer_id,
        policyholder_email,
        policyholder_name,
        claim_contractors (contractor_id)
      `)
      .eq("id", claimId)
      .single();

    if (data) {
      setClaim(data);
    }
  };

  const fetchUpdates = async () => {
    const { data: updatesData } = await supabase
      .from("claim_updates")
      .select(`
        id,
        content,
        created_at,
        user_id,
        recipients
      `)
      .eq("claim_id", claimId)
      .order("created_at", { ascending: false });

    if (updatesData) {
      const userIds = [...new Set(updatesData.map((u) => u.user_id).filter(Boolean))];
      const { data: profilesData } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);

      const profilesMap = new Map(profilesData?.map((p) => [p.id, p]) || []);

      const updatesWithProfiles = updatesData.map((update) => ({
        ...update,
        profiles: update.user_id ? profilesMap.get(update.user_id) || null : null,
      }));

      setUpdates(updatesWithProfiles);
    }
  };

  const handleAddUpdate = async () => {
    if (!newUpdate.trim() || !user) return;

    if (useCustomTimestamp && (!customDate || !customTime)) {
      toast.error("Please select both a date and time for the note.");
      return;
    }

    setLoading(true);
    const recipients: string[] = [];

    if (claim) {
      if (notifyClient && claim.client_id) recipients.push(claim.client_id);
      if (notifyReferrer && claim.referrer_id) recipients.push(claim.referrer_id);
      if (notifyContractors) {
        claim.claim_contractors.forEach((cc) => recipients.push(cc.contractor_id));
      }
    }

    let createdAt: string | undefined;
    if (useCustomTimestamp && customDate && customTime) {
      const iso = new Date(`${customDate}T${customTime}:00`).toISOString();
      createdAt = iso;
    }

    const { data: update, error: updateError } = await supabase
      .from("claim_updates")
      .insert({
        claim_id: claimId,
        content: newUpdate,
        user_id: user.id,
        update_type: "note",
        recipients: recipients,
        ...(createdAt ? { created_at: createdAt } : {}),
      })
      .select()
      .single();

    if (updateError) {
      toast.error("Failed to add update");
      setLoading(false);
      return;
    }

    if (recipients.length > 0 && update) {
      const notifications = recipients.map((recipient) => ({
        user_id: recipient,
        claim_id: claimId,
        update_id: update.id,
      }));

      await supabase.from("notifications").insert(notifications);
    }

    setNewUpdate("");
    setUseCustomTimestamp(false);
    setCustomDate("");
    setCustomTime("");
    setNotifyClient(false);
    setNotifyReferrer(false);
    setNotifyContractors(false);
    setLoading(false);
    toast.success("Update added successfully");
    fetchUpdates();
  };

  const handleAskAI = async () => {
    if (!aiQuestion.trim()) return;

    const userMessage: AiMessage = {
      role: "user",
      content: aiQuestion,
      timestamp: new Date(),
    };

    setAiMessages((prev) => [...prev, userMessage]);
    setAiQuestion("");
    setAiLoading(true);

    try {
      const conversationHistory = aiMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const { data, error } = await supabase.functions.invoke("claims-ai-assistant", {
        body: {
          claimId,
          question: userMessage.content,
          messages: conversationHistory,
        },
      });

      if (error) throw error;

      const assistantMessage: AiMessage = {
        role: "assistant",
        content: data.answer,
        timestamp: new Date(),
      };

      setAiMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("Error asking AI:", error);
      toast.error(error.message || "Failed to get AI response");
    } finally {
      setAiLoading(false);
    }
  };

  const handleGenerateReport = async (reportType: string) => {
    setReportLoading(reportType);

    const reportNames: Record<string, string> = {
      weather: "Weather Report",
      damage: "Damage Explanation",
      estimate: "Estimate Discussion",
      photos: "Photo Documentation Guide",
    };

    try {
      const { data, error } = await supabase.functions.invoke("claims-ai-assistant", {
        body: {
          claimId,
          question: "",
          reportType,
        },
      });

      if (error) throw error;

      const reportMessage: AiMessage = {
        role: "assistant",
        content: `## ${reportNames[reportType]}\n\n${data.answer}`,
        timestamp: new Date(),
      };

      setAiMessages((prev) => [...prev, reportMessage]);
      toast.success(`${reportNames[reportType]} generated`);
    } catch (error: any) {
      console.error("Error generating report:", error);
      toast.error(error.message || "Failed to generate report");
    } finally {
      setReportLoading(null);
    }
  };

  const handleEditUpdate = (update: Update) => {
    setEditingUpdate(update);
    setEditContent(update.content);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingUpdate || !editContent.trim()) return;

    try {
      const { error } = await supabase
        .from("claim_updates")
        .update({ content: editContent })
        .eq("id", editingUpdate.id);

      if (error) throw error;

      toast.success("Update edited successfully");
      setEditDialogOpen(false);
      setEditingUpdate(null);
      setEditContent("");
      fetchUpdates();
    } catch (error: any) {
      console.error("Error editing update:", error);
      toast.error("Failed to edit update");
    }
  };

  const handleDeleteUpdate = async (updateId: string) => {
    console.log("[ClaimNotes] Request to delete update", { updateId });

    if (!updateId) {
      console.error("[ClaimNotes] Missing updateId for delete");
      toast.error("Unable to delete this note. Please refresh and try again.");
      return;
    }

    try {
      const { error } = await supabase
        .from("claim_updates")
        .delete()
        .eq("id", updateId);

      if (error) {
        console.error("[ClaimNotes] Error from delete call", error);
        throw error;
      }

      setUpdates((prev) => prev.filter((update) => update.id !== updateId));

      console.log("[ClaimNotes] Update deleted successfully", { updateId });
      toast.success("Update deleted successfully");
      fetchUpdates();
    } catch (error: any) {
      console.error("Error deleting update:", error);
      toast.error(error?.message || "Failed to delete update");
    }
  };

  return (
    <>
      <Tabs defaultValue="notes" className="w-full">
        <TabsList className="flex flex-row w-full bg-muted/40 p-2 gap-1 overflow-x-auto scrollbar-hide mb-6">
          <TabsTrigger value="notes" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Notes & Updates
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex-1 md:flex-none justify-start text-base font-medium px-4 whitespace-nowrap flex items-center gap-2">
            <Bot className="h-4 w-4" />
            AI Assistant
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="space-y-6">
          <div className="space-y-3">
            <Textarea
              placeholder="Add a note or update..."
              value={newUpdate}
              onChange={(e) => setNewUpdate(e.target.value)}
              className="min-h-[100px]"
            />

            <div className="grid gap-2 sm:grid-cols-2 items-end">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    id="custom-timestamp"
                    checked={useCustomTimestamp}
                    onCheckedChange={(checked) => setUseCustomTimestamp(checked as boolean)}
                  />
                  Use custom date & time
                </Label>
                {useCustomTimestamp && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="date"
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                    />
                    <Input
                      type="time"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <Button
                onClick={handleAddUpdate}
                disabled={loading || !newUpdate.trim()}
                className="w-full sm:w-auto bg-primary hover:bg-primary/90 justify-center"
              >
                <Send className="h-4 w-4 mr-2" />
                {loading ? "Sending..." : "Add Update"}
              </Button>
            </div>

            {isStaff && claim && (
              <div className="space-y-2 p-3 rounded-lg bg-muted/30">
                <Label className="text-sm font-medium">Notify:</Label>
                <div className="flex flex-wrap gap-4">
                  {(claim.client_id || claim.policyholder_email) && (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="notify-client"
                        checked={notifyClient}
                        onCheckedChange={(checked) => setNotifyClient(checked as boolean)}
                      />
                      <Label htmlFor="notify-client" className="text-sm cursor-pointer">
                        Client/Policyholder
                      </Label>
                    </div>
                  )}
                  {claim.referrer_id && (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="notify-referrer"
                        checked={notifyReferrer}
                        onCheckedChange={(checked) => setNotifyReferrer(checked as boolean)}
                      />
                      <Label htmlFor="notify-referrer" className="text-sm cursor-pointer">
                        Referrer
                      </Label>
                    </div>
                  )}
                  {claim.claim_contractors.length > 0 && (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="notify-contractors"
                        checked={notifyContractors}
                        onCheckedChange={(checked) => setNotifyContractors(checked as boolean)}
                      />
                      <Label htmlFor="notify-contractors" className="text-sm cursor-pointer">
                        Contractors
                      </Label>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {updates.map((update) => {
              const isCurrentUser = user?.id === update.user_id;
              const authorName = isCurrentUser
                ? "You"
                : update.profiles?.full_name || update.profiles?.email || "Unknown";

              return (
                <div key={update.id} className="flex gap-3 p-4 rounded-lg bg-muted/50">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {authorName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{authorName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(update.created_at), "MMM d, yyyy h:mm a")}
                        </span>
                        {(isStaff || isCurrentUser) && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleEditUpdate(update)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => {
                                console.log("[ClaimNotes] Delete button clicked", update.id);
                                handleDeleteUpdate(update.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{update.content}</p>
                    {update.recipients && update.recipients.length > 0 && isStaff && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Notified {update.recipients.length}{" "}
                        {update.recipients.length === 1 ? "person" : "people"}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {updates.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">
                No updates yet. Add the first update to this claim.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="ai" className="space-y-6">
          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="flex gap-3">
              <Bot className="h-5 w-5 text-primary mt-1" />
              <div className="flex-1 text-sm space-y-2">
                <p className="font-medium text-foreground">AI Claims Expert</p>
                <p className="text-muted-foreground">
                  Ask questions about claim strategy, adjuster negotiations, coverage maximization, or next
                  steps. I have full context of this claim and can provide expert guidance.
                </p>
              </div>
            </div>
          </Card>

          {/* Report Generation Buttons */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Generate Reports</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleGenerateReport("weather")}
                disabled={!!reportLoading || aiLoading}
                className="flex items-center gap-2"
              >
                {reportLoading === "weather" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Cloud className="h-4 w-4" />
                )}
                Weather
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleGenerateReport("damage")}
                disabled={!!reportLoading || aiLoading}
                className="flex items-center gap-2"
              >
                {reportLoading === "damage" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                Damage
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleGenerateReport("estimate")}
                disabled={!!reportLoading || aiLoading}
                className="flex items-center gap-2"
              >
                {reportLoading === "estimate" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Calculator className="h-4 w-4" />
                )}
                Estimate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleGenerateReport("photos")}
                disabled={!!reportLoading || aiLoading}
                className="flex items-center gap-2"
              >
                {reportLoading === "photos" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                Photos
              </Button>
            </div>
          </div>

          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {aiMessages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-3 p-4 rounded-lg ${
                  message.role === "user" ? "bg-primary/10 ml-8" : "bg-muted/50 mr-8"
                }`}
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback
                    className={`text-xs ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {message.role === "user" ? "U" : "AI"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {message.role === "user" ? "You" : "AI Assistant"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(message.timestamp, "h:mm a")}
                    </span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}
            {aiMessages.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">
                Start a conversation by asking a question about this claim.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Textarea
              placeholder="Ask a question about this claim... (e.g., 'How should I respond to the adjuster's depreciation estimate?' or 'What's my best strategy to maximize this settlement?')"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAskAI();
                }
              }}
              className="min-h-[100px]"
              disabled={aiLoading}
            />

            <Button
              onClick={handleAskAI}
              disabled={aiLoading || !aiQuestion.trim()}
              className="w-full bg-primary hover:bg-primary/90"
            >
              {aiLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Getting advice...
                </>
              ) : (
                <>
                  <Bot className="h-4 w-4 mr-2" />
                  Ask AI Assistant
                </>
              )}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Update</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[150px] mt-4"
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} className="bg-primary hover:bg-primary/90">
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              This note will be permanently removed from the claim activity history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteTarget) {
                  await handleDeleteUpdate(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
