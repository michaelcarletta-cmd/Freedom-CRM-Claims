import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, Send, Loader2, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AiMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export const ClaimsAIAssistant = () => {
  const [open, setOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

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
          question: userMessage.content,
          messages: conversationHistory,
          mode: "general", // Flag for general assistant mode
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAskAI();
    }
  };

  const clearChat = () => {
    setAiMessages([]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50"
          size="icon"
        >
          <Sparkles className="h-6 w-6" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] h-[600px] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              Claims AI Assistant
            </DialogTitle>
            {aiMessages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearChat}>
                Clear Chat
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 flex flex-col overflow-hidden">
          {aiMessages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <Card className="p-6 bg-primary/5 border-primary/20 max-w-sm">
                <div className="text-center space-y-3">
                  <Bot className="h-12 w-12 text-primary mx-auto" />
                  <h3 className="font-semibold">Your Claims Assistant</h3>
                  <p className="text-sm text-muted-foreground">
                    I can help you with:
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1 text-left">
                    <li>• Draft follow-up communications</li>
                    <li>• Summarize claim statuses</li>
                    <li>• Suggest next steps for claims</li>
                    <li>• Explain insurance terms & regulations</li>
                    <li>• Help with adjuster negotiations</li>
                  </ul>
                </div>
              </Card>
            </div>
          ) : (
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {aiMessages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex gap-3 ${
                      message.role === "user" ? "flex-row-reverse" : ""
                    }`}
                  >
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback
                        className={
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }
                      >
                        {message.role === "user" ? "U" : <Bot className="h-4 w-4" />}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={`flex-1 p-3 rounded-lg text-sm ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground ml-8"
                          : "bg-muted mr-8"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="flex gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-muted">
                        <Bot className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 p-3 rounded-lg bg-muted mr-8">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Textarea
                placeholder="Ask about claims, follow-ups, strategies..."
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-h-[60px] max-h-[120px] resize-none"
                disabled={aiLoading}
              />
              <Button
                onClick={handleAskAI}
                disabled={aiLoading || !aiQuestion.trim()}
                size="icon"
                className="h-[60px] w-[60px]"
              >
                {aiLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
