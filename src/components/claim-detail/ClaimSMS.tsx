import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Send, Phone } from "lucide-react";
import { format } from "date-fns";

interface SMSMessage {
  id: string;
  from_number: string;
  to_number: string;
  message_body: string;
  status: string;
  direction: string;
  created_at: string;
  user_id: string;
}

interface ClaimSMSProps {
  claimId: string;
  policyholderPhone?: string;
}

export function ClaimSMS({ claimId, policyholderPhone }: ClaimSMSProps) {
  const [messages, setMessages] = useState<SMSMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [phoneNumber, setPhoneNumber] = useState(policyholderPhone || "");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchMessages();
    
    // Subscribe to new SMS messages
    const channel = supabase
      .channel('sms-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sms_messages',
          filter: `claim_id=eq.${claimId}`,
        },
        (payload) => {
          setMessages((current) => [payload.new as SMSMessage, ...current]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [claimId]);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sms_messages")
        .select("*")
        .eq("claim_id", claimId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setMessages(data || []);
    } catch (error: any) {
      console.error("Error fetching SMS messages:", error);
      toast({
        title: "Error",
        description: "Failed to load SMS messages",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendSMS = async () => {
    if (!newMessage.trim() || !phoneNumber.trim()) {
      toast({
        title: "Error",
        description: "Please enter both phone number and message",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-sms", {
        body: {
          claimId,
          toNumber: phoneNumber,
          messageBody: newMessage,
        },
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "SMS sent successfully",
      });

      setNewMessage("");
    } catch (error: any) {
      console.error("Error sending SMS:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send SMS",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Send SMS Form */}
      <Card className="p-6 border-border bg-card">
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Send Text Message</h3>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <div className="flex gap-2">
              <Phone className="h-4 w-4 mt-3 text-muted-foreground" />
              <Input
                id="phone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              placeholder="Type your message here..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          <Button
            onClick={handleSendSMS}
            disabled={sending || !newMessage.trim() || !phoneNumber.trim()}
            className="w-full"
          >
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Sending..." : "Send SMS"}
          </Button>
        </div>
      </Card>

      {/* Messages List */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Message History</h3>
        
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading messages...</div>
        ) : messages.length === 0 ? (
          <Card className="p-8 text-center border-border bg-card">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No messages yet</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <Card
                key={message.id}
                className={`p-4 border-border ${
                  message.direction === "outbound"
                    ? "bg-primary/5 ml-8"
                    : "bg-secondary/50 mr-8"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      {message.direction === "outbound" ? "To" : "From"}: {" "}
                      {message.direction === "outbound"
                        ? message.to_number
                        : message.from_number}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        message.status === "delivered"
                          ? "bg-green-500/10 text-green-600"
                          : message.status === "sent" || message.status === "queued"
                          ? "bg-blue-500/10 text-blue-600"
                          : message.status === "failed"
                          ? "bg-red-500/10 text-red-600"
                          : "bg-gray-500/10 text-gray-600"
                      }`}
                    >
                      {message.status === "queued" ? "Sent" : message.status}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-foreground mb-2">{message.message_body}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(message.created_at), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
