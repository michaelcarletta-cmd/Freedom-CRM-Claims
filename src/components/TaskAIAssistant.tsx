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
    claim_id: string;
    claim_number: string;
  };
}

interface SuggestedAction {
  type: "email" | "sms" | "note";
  title: string;
  content: string;
}

const TaskAIAssistant = ({ task }: TaskAIAssistantProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [suggestedActions, setSuggestedActions] = useState<SuggestedAction[]>([]);
  const [customPrompt, setCustomPrompt] = useState("");
  const { toast } = useToast();

  const handleAnalyzeTask = async () => {
    setLoading(true);
    setAnalysis(null);
    setSuggestedActions([]);

    try {
      // Fetch claim details for context
      const { data: claim } = await supabase
        .from("claims")
        .select("*")
        .eq("id", task.claim_id)
        .single();

      const { data, error } = await supabase.functions.invoke("darwin-ai-analysis", {
        body: {
          claimId: task.claim_id,
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
              <span>Claim: {task.claim_number}</span>
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
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyToClipboard(action.content)}
                            >
                              Copy
                            </Button>
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
