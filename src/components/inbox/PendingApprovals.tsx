import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  Bot,
  Check,
  X,
  Mail,
  MessageSquare,
  FileText,
  Clock,
  ArrowRight,
  Edit,
} from "lucide-react";
import { format } from "date-fns";

interface PendingAction {
  id: string;
  claim_id: string;
  action_type: string;
  status: string;
  trigger_email_id: string | null;
  draft_content: {
    to_email?: string;
    to_name?: string;
    to_number?: string;
    subject?: string;
    body?: string;
    message?: string;
    original_subject?: string;
    original_body?: string;
  };
  ai_reasoning: string | null;
  created_at: string;
  claims?: {
    id: string;
    claim_number: string;
    policyholder_name: string;
  };
}

export const PendingApprovals = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedAction, setSelectedAction] = useState<PendingAction | null>(null);
  const [editedContent, setEditedContent] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);

  const { data: pendingActions, isLoading } = useQuery({
    queryKey: ["pending-ai-actions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_ai_pending_actions")
        .select(`
          *,
          claims (
            id,
            claim_number,
            policyholder_name
          )
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as PendingAction[];
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ actionId, content }: { actionId: string; content?: any }) => {
      // If content was edited, update the pending action first
      if (content) {
        const { error: updateError } = await supabase
          .from("claim_ai_pending_actions")
          .update({ draft_content: content })
          .eq("id", actionId);

        if (updateError) throw updateError;
      }

      const { data, error } = await supabase.functions.invoke("process-claim-ai-action", {
        body: {
          action: "approve_and_send",
          pendingActionId: actionId,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-ai-actions"] });
      toast({
        title: "Approved & Sent",
        description: "The AI-drafted message has been sent successfully.",
      });
      setSelectedAction(null);
      setEditedContent(null);
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (actionId: string) => {
      const { data, error } = await supabase.functions.invoke("process-claim-ai-action", {
        body: {
          action: "reject",
          pendingActionId: actionId,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-ai-actions"] });
      toast({
        title: "Rejected",
        description: "The AI draft has been discarded.",
      });
      setSelectedAction(null);
    },
  });

  const getActionIcon = (type: string) => {
    switch (type) {
      case "email_response":
        return <Mail className="h-4 w-4" />;
      case "sms":
        return <MessageSquare className="h-4 w-4" />;
      case "note":
        return <FileText className="h-4 w-4" />;
      default:
        return <Bot className="h-4 w-4" />;
    }
  };

  const handleOpenReview = (action: PendingAction) => {
    setSelectedAction(action);
    setEditedContent(action.draft_content);
    setIsEditing(false);
  };

  const handleApprove = () => {
    if (!selectedAction) return;
    approveMutation.mutate({
      actionId: selectedAction.id,
      content: isEditing ? editedContent : undefined,
    });
  };

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!pendingActions || pendingActions.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex flex-col items-center justify-center py-10">
          <Bot className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No pending AI actions to review</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {pendingActions.map((action) => (
          <Card
            key={action.id}
            className="bg-card border-border hover:border-primary/50 cursor-pointer transition-colors"
            onClick={() => handleOpenReview(action)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-primary/10 rounded">
                      {getActionIcon(action.action_type)}
                    </div>
                    <CardTitle className="text-base text-foreground">
                      {action.action_type === "email_response" && "Email Response Draft"}
                      {action.action_type === "sms" && "SMS Draft"}
                      {action.action_type === "note" && "Note Draft"}
                    </CardTitle>
                    <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">
                      Awaiting Review
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(action.created_at), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                    {action.draft_content.to_email && (
                      <>
                        <span>•</span>
                        <span>To: {action.draft_content.to_email}</span>
                      </>
                    )}
                    {action.draft_content.to_number && (
                      <>
                        <span>•</span>
                        <span>To: {action.draft_content.to_number}</span>
                      </>
                    )}
                  </div>
                </div>
                {action.claims && (
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className="border-primary/30 text-primary">
                      {action.claims.claim_number || "No Claim #"}
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {action.claims && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Claim: </span>
                  {action.claims.policyholder_name}
                </div>
              )}
              {action.draft_content.subject && (
                <div className="text-sm text-muted-foreground mt-1">
                  <span className="font-medium text-foreground">Subject: </span>
                  {action.draft_content.subject}
                </div>
              )}
              {action.draft_content.message && (
                <div className="text-sm text-muted-foreground mt-1 truncate max-w-md">
                  <span className="font-medium text-foreground">Message: </span>
                  {action.draft_content.message}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!selectedAction} onOpenChange={() => setSelectedAction(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              Review AI Draft
            </DialogTitle>
          </DialogHeader>

          {selectedAction && (
            <div className="space-y-4">
              {selectedAction.claims && (
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{selectedAction.claims.claim_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedAction.claims.policyholder_name}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/claims/${selectedAction.claims?.id}`)}
                  >
                    View Claim
                  </Button>
                </div>
              )}

              {selectedAction.draft_content.original_body && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Original Email</Label>
                  <div className="p-3 bg-muted/30 rounded-lg text-sm">
                    <p className="font-medium mb-1">
                      Subject: {selectedAction.draft_content.original_subject}
                    </p>
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {selectedAction.draft_content.original_body}
                    </p>
                  </div>
                </div>
              )}

              {selectedAction.ai_reasoning && (
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <p className="text-xs text-primary font-medium mb-1">AI Reasoning</p>
                  <p className="text-sm text-muted-foreground">{selectedAction.ai_reasoning}</p>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-foreground">Draft Response</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditing(!isEditing)}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    {isEditing ? "Cancel Edit" : "Edit"}
                  </Button>
                </div>

                {selectedAction.action_type === "email_response" && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">To</Label>
                      <Input
                        value={editedContent?.to_email || ""}
                        disabled={!isEditing}
                        onChange={(e) =>
                          setEditedContent({ ...editedContent, to_email: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Subject</Label>
                      <Input
                        value={editedContent?.subject || ""}
                        disabled={!isEditing}
                        onChange={(e) =>
                          setEditedContent({ ...editedContent, subject: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Body</Label>
                      <Textarea
                        value={editedContent?.body || ""}
                        disabled={!isEditing}
                        rows={10}
                        className="font-mono text-sm"
                        onChange={(e) =>
                          setEditedContent({ ...editedContent, body: e.target.value })
                        }
                      />
                    </div>
                  </>
                )}

                {selectedAction.action_type === "sms" && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">To</Label>
                      <Input
                        value={editedContent?.to_number || ""}
                        disabled={!isEditing}
                        onChange={(e) =>
                          setEditedContent({ ...editedContent, to_number: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm text-muted-foreground">Message</Label>
                      <Textarea
                        value={editedContent?.message || ""}
                        disabled={!isEditing}
                        rows={4}
                        onChange={(e) =>
                          setEditedContent({ ...editedContent, message: e.target.value })
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              onClick={() => selectedAction && rejectMutation.mutate(selectedAction.id)}
              disabled={rejectMutation.isPending}
            >
              <X className="h-4 w-4 mr-1" />
              Reject
            </Button>
            <Button
              onClick={handleApprove}
              disabled={approveMutation.isPending}
              className="bg-primary hover:bg-primary/90"
            >
              {approveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-1" />
              )}
              Approve & Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
