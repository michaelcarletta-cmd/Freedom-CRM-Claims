import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { Plus, Send, Bot, MessageSquare, Loader2, Edit, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [claim, setClaim] = useState<Claim | null>(null);
  const [notifyClient, setNotifyClient] = useState(false);
  const [notifyReferrer, setNotifyReferrer] = useState(false);
  const [notifyContractors, setNotifyContractors] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingUpdate, setEditingUpdate] = useState<Update | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
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

    setLoading(true);
    const recipients: string[] = [];

    if (claim) {
      if (notifyClient && claim.client_id) recipients.push(claim.client_id);
      if (notifyReferrer && claim.referrer_id) recipients.push(claim.referrer_id);
      if (notifyContractors) {
        claim.claim_contractors.forEach((cc) => recipients.push(cc.contractor_id));
      }
    }

    const { data: update, error: updateError } = await supabase
      .from("claim_updates")
      .insert({
        claim_id: claimId,
        content: newUpdate,
        user_id: user.id,
        update_type: "note",
        recipients: recipients,
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

    const confirmed = window.confirm("Are you sure you want to delete this update?");
    if (!confirmed) {
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
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="notes" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Notes & Updates
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-2">
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

            <Button
              onClick={handleAddUpdate}
              disabled={loading || !newUpdate.trim()}
              className="w-full bg-primary hover:bg-primary/90"
            >
              <Send className="h-4 w-4 mr-2" />
              {loading ? "Sending..." : "Add Update"}
            </Button>
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
    </>
  );
};
