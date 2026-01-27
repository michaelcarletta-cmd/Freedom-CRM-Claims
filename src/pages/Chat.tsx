import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, Send, Loader2, ArrowLeft, Sparkles, FileText, CheckSquare, Users, Search, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";

interface AiMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const quickActions = [
  { icon: Search, label: "Find claim", prompt: "Find claim for " },
  { icon: CheckSquare, label: "My tasks", prompt: "What are my overdue tasks?" },
  { icon: ClipboardList, label: "Today's summary", prompt: "Give me a summary of my claims for today" },
  { icon: Users, label: "Inactive claims", prompt: "Which claims have been inactive for over 2 weeks?" },
];

export default function Chat() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async (customMessage?: string) => {
    const messageText = customMessage || message;
    if (!messageText.trim()) return;

    const userMessage: AiMessage = {
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage("");
    setLoading(true);

    try {
      const conversationHistory = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const { data, error } = await supabase.functions.invoke("claims-ai-assistant", {
        body: {
          question: userMessage.content,
          messages: conversationHistory,
          mode: "general",
        },
      });

      if (error) throw error;

      // Show toast for created tasks
      if (data.tasksCreated && data.tasksCreated.length > 0) {
        const taskCount = data.tasksCreated.length;
        toast.success(`${taskCount} task${taskCount > 1 ? 's' : ''} created`);
      }

      // Check if bulk operations were performed
      const hasBulkOperation = data.answer && (
        data.answer.includes("Bulk Status Update:") ||
        data.answer.includes("Claims Closed:") ||
        data.answer.includes("Claims Reopened:") ||
        data.answer.includes("Staff Assigned:")
      );

      if (hasBulkOperation) {
        toast.success("Bulk operation completed");
        queryClient.invalidateQueries({ queryKey: ["claims"] });
      }

      const assistantMessage: AiMessage = {
        role: "assistant",
        content: data.answer,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message || "Failed to get response");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleQuickAction = (prompt: string) => {
    if (prompt.endsWith(" ")) {
      // This is a prompt that needs user input
      setMessage(prompt);
      inputRef.current?.focus();
    } else {
      // This is a complete prompt
      handleSend(prompt);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center shrink-0">
            <Bot className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="font-semibold text-base truncate">Claims Assistant</h1>
            <p className="text-xs text-muted-foreground">Ask anything about your claims</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearChat} className="shrink-0 text-xs">
            Clear
          </Button>
        )}
      </header>

      {/* Messages Area */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-lg font-semibold mb-2">How can I help?</h2>
              <p className="text-sm text-muted-foreground text-center mb-6 max-w-xs">
                I can look up claims, create tasks, draft emails, update statuses, and more.
              </p>
              
              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                {quickActions.map((action) => (
                  <Card
                    key={action.label}
                    className="p-3 cursor-pointer hover:bg-accent transition-colors active:scale-95"
                    onClick={() => handleQuickAction(action.prompt)}
                  >
                    <div className="flex items-center gap-2">
                      <action.icon className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-sm font-medium truncate">{action.label}</span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback
                      className={
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }
                    >
                      {msg.role === "user" ? "U" : <Bot className="h-4 w-4" />}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted rounded-bl-md"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    <p className={`text-[10px] mt-1 ${
                      msg.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"
                    }`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-muted">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted p-3 rounded-2xl rounded-bl-md">
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="h-2 w-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="h-2 w-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t bg-background p-3 pb-safe">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <Input
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Message..."
            className="flex-1 rounded-full bg-muted border-0 px-4 h-11"
            disabled={loading}
          />
          <Button
            type="submit"
            size="icon"
            className="h-11 w-11 rounded-full shrink-0"
            disabled={loading || !message.trim()}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
