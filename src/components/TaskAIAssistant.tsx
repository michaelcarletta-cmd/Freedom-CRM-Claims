import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Brain, Loader2, Send, Mail, MessageSquare, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TaskAIAssistantProps {
  task: {
    id: string;
    title: string;
    description: string | null;
    due_date: string | null;
    status: string;
    priority: string;
    follow_up_enabled?: boolean | null;
    follow_up_interval_days?: number | null;
    follow_up_current_count?: number | null;
    follow_up_last_sent_at?: string | null;
  };
  claimId: string;
  onTaskUpdated?: () => void;
}

interface SuggestedAction {
  type: "email" | "sms" | "note";
  title: string;
  content: string;
}

interface ClaimData {
  id: string;
  claim_number: string | null;
  policyholder_name: string | null;
  policyholder_email: string | null;
  policyholder_phone: string | null;
  adjuster_name: string | null;
  adjuster_email: string | null;
  adjuster_phone: string | null;
}

interface AdjusterData {
  adjuster_name: string;
  adjuster_email: string | null;
  adjuster_phone: string | null;
}

const TaskAIAssistant = ({ task, claimId, onTaskUpdated }: TaskAIAssistantProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingAction, setSendingAction] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [suggestedActions, setSuggestedActions] = useState<SuggestedAction[]>([]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [claimData, setClaimData] = useState<ClaimData | null>(null);
  const [primaryAdjuster, setPrimaryAdjuster] = useState<AdjusterData | null>(null);
  const [userSignature, setUserSignature] = useState<string>("Freedom Adjustment");
  const { toast } = useToast();

  const handleAnalyzeTask = async () => {
    setLoading(true);
    setAnalysis(null);
    setSuggestedActions([]);

    try {
      // Fetch claim details, primary adjuster, and user signature in parallel
      const [claimResult, adjustersResult, userResult] = await Promise.all([
        supabase.from("claims").select("*").eq("id", claimId).single(),
        supabase.from("claim_adjusters").select("adjuster_name, adjuster_email, adjuster_phone").eq("claim_id", claimId).eq("is_primary", true).single(),
        supabase.auth.getUser(),
      ]);

      const claim = claimResult.data;
      setClaimData(claim);
      
      // Set primary adjuster if found
      if (adjustersResult.data) {
        setPrimaryAdjuster(adjustersResult.data);
      }

      // Fetch user's email signature
      if (userResult.data?.user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email_signature")
          .eq("id", userResult.data.user.id)
          .single();
        
        if (profile?.email_signature) {
          setUserSignature(profile.email_signature);
        }
      }

      const { data, error } = await supabase.functions.invoke("darwin-ai-analysis", {
        body: {
          claimId: claimId,
          analysisType: "task_followup",
          additionalContext: {
            task: {
              title: task.title,
              description: task.description,
              due_date: task.due_date,
              status: task.status,
              priority: task.priority,
            },
            claim: claim,
            adjuster: adjustersResult.data,
            customPrompt: customPrompt || undefined,
          },
        },
      });

      if (error) throw error;

      setAnalysis(data.analysis);
      if (data.suggestedActions) {
        setSuggestedActions(data.suggestedActions);
      }
    } catch (error: any) {
      console.error("Error analyzing task:", error);
      toast({
        title: "Error",
        description: "Failed to analyze task",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendAction = async (action: SuggestedAction, index: number) => {
    if (!claimData) return;

    setSendingAction(index);

    try {
      if (action.type === "email") {
        // Prioritize adjuster (insurance company) over client
        const adjusterEmail = primaryAdjuster?.adjuster_email || claimData.adjuster_email;
        const adjusterName = primaryAdjuster?.adjuster_name || claimData.adjuster_name;
        
        const recipientEmail = adjusterEmail || claimData.policyholder_email;
        const recipientName = adjusterEmail ? (adjusterName || "Adjuster") : (claimData.policyholder_name || "there");

        if (!recipientEmail) {
          toast({
            title: "No recipient",
            description: "No email address found for this claim",
            variant: "destructive",
          });
          return;
        }

        // Append signature to email content
        const emailBody = `${action.content}\n\n${userSignature}`;

        const { error } = await supabase.functions.invoke("send-email", {
          body: {
            recipients: [{ email: recipientEmail, name: recipientName, type: "task_followup" }],
            subject: `Re: Claim #${claimData.claim_number || claimId.slice(0, 8)}`,
            body: emailBody,
            claimId: claimId,
          },
        });

        if (error) throw error;

        // Update task follow-up tracking without completing the task
        // This marks that a follow-up was sent while keeping the task open for future automated follow-ups
        const now = new Date().toISOString();
        const currentCount = task.follow_up_current_count || 0;
        const intervalDays = task.follow_up_interval_days || 3;
        const nextFollowUp = new Date();
        nextFollowUp.setDate(nextFollowUp.getDate() + intervalDays);

        await supabase
          .from("tasks")
          .update({
            follow_up_last_sent_at: now,
            follow_up_current_count: currentCount + 1,
            follow_up_next_at: task.follow_up_enabled ? nextFollowUp.toISOString() : null,
          })
          .eq("id", task.id);

        // Trigger refresh if callback provided
        onTaskUpdated?.();

        toast({
          title: "Email sent",
          description: `Follow-up email sent to ${recipientEmail}. Task updated for tracking.`,
        });
      } else if (action.type === "sms") {
        // Prioritize adjuster phone over client
        const adjusterPhone = primaryAdjuster?.adjuster_phone || claimData.adjuster_phone;
        const recipientPhone = adjusterPhone || claimData.policyholder_phone;

        if (!recipientPhone) {
          toast({
            title: "No recipient",
            description: "No phone number found for this claim",
            variant: "destructive",
          });
          return;
        }

        const { error } = await supabase.functions.invoke("send-sms", {
          body: {
            toNumber: recipientPhone,
            messageBody: action.content,
            claimId: claimId,
          },
        });

        if (error) throw error;

        toast({
          title: "SMS sent",
          description: `Follow-up SMS sent to ${recipientPhone}`,
        });
      } else if (action.type === "note") {
        const { error } = await supabase.from("claim_updates").insert({
          claim_id: claimId,
          content: action.content,
          update_type: "note",
        });

        if (error) throw error;

        toast({
          title: "Note added",
          description: "Follow-up note added to claim",
        });
      }
    } catch (error: any) {
      console.error("Error sending action:", error);
      toast({
        title: "Error",
        description: `Failed to send ${action.type}`,
        variant: "destructive",
      });
    } finally {
      setSendingAction(null);
    }
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case "email":
        return <Mail className="h-4 w-4" />;
      case "sms":
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({
      title: "Copied",
      description: "Content copied to clipboard",
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="AI Follow-up Assistant">
          <Brain className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI Task Follow-up Assistant
          </DialogTitle>
          <DialogDescription>
            Get AI-powered suggestions to follow up on: <strong>{task.title}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-muted/50 rounded-lg text-sm">
            <div className="font-medium">Task: {task.title}</div>
            {task.description && (
              <div className="text-muted-foreground mt-1">{task.description}</div>
            )}
            <div className="flex gap-4 mt-2 text-muted-foreground">
              <span>Claim: {claimData?.claim_number || claimId.slice(0, 8)}</span>
              <span>Priority: {task.priority}</span>
              {task.due_date && <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Additional context (optional)</label>
            <Textarea
              placeholder="Add any specific instructions or context for the follow-up..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={2}
            />
          </div>

          <Button onClick={handleAnalyzeTask} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Brain className="h-4 w-4 mr-2" />
                Generate Follow-up Suggestions
              </>
            )}
          </Button>

          {analysis && (
            <ScrollArea className="h-[300px] border rounded-lg p-4">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Analysis & Recommendations</h4>
                  <div className="text-sm whitespace-pre-wrap text-muted-foreground">
                    {analysis}
                  </div>
                </div>

                {suggestedActions.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Suggested Actions</h4>
                    <div className="space-y-3">
                      {suggestedActions.map((action, index) => (
                        <div key={index} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 font-medium text-sm">
                              {getActionIcon(action.type)}
                              {action.title}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyToClipboard(action.content)}
                              >
                                Copy
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleSendAction(action, index)}
                                disabled={sendingAction === index}
                              >
                                {sendingAction === index ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Send className="h-4 w-4 mr-1" />
                                    Send
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground bg-muted/30 p-2 rounded">
                            {action.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskAIAssistant;
