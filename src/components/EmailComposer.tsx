import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Loader2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

interface Recipient {
  email: string;
  name: string;
  type: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string | null;
}

interface EmailComposerProps {
  isOpen: boolean;
  onClose: () => void;
  claimId: string;
  claim: any;
}

export function EmailComposer({
  isOpen,
  onClose,
  claimId,
  claim
}: EmailComposerProps) {
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  // Fetch email templates
  const { data: emailTemplates } = useQuery({
    queryKey: ["email-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("id, name, subject, body, category")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as EmailTemplate[];
    },
    enabled: isOpen,
  });

  // Replace merge fields with actual values
  const replaceMergeFields = (text: string) => {
    return text
      .replace(/\{claim\.policyholder_name\}/g, claim.policyholder_name || '')
      .replace(/\{claim\.claim_number\}/g, claim.claim_number || '')
      .replace(/\{claim\.status\}/g, claim.status || '')
      .replace(/\{claim\.loss_type\}/g, claim.loss_type || '')
      .replace(/\{claim\.loss_date\}/g, claim.loss_date || '')
      .replace(/\{claim\.policy_number\}/g, claim.policy_number || '')
      .replace(/\{claim\.policyholder_email\}/g, claim.policyholder_email || '')
      .replace(/\{claim\.policyholder_phone\}/g, claim.policyholder_phone || '')
      .replace(/\{claim\.policyholder_address\}/g, claim.policyholder_address || '');
  };

  const handleTemplateSelect = (templateId: string) => {
    if (templateId === "_none") {
      return;
    }
    const template = emailTemplates?.find(t => t.id === templateId);
    if (template) {
      setEmailSubject(replaceMergeFields(template.subject));
      setBody(replaceMergeFields(template.body));
    }
  };

  // Build recipients list from claim data
  const recipients: Recipient[] = [];
  
  if (claim.policyholder_email) {
    recipients.push({
      email: claim.policyholder_email,
      name: claim.policyholder_name,
      type: "policyholder"
    });
  }
  
  if (claim.adjuster_email) {
    recipients.push({
      email: claim.adjuster_email,
      name: claim.adjuster_name || "Adjuster",
      type: "adjuster"
    });
  }

  // Fetch contractors
  const { data: contractors } = useQuery({
    queryKey: ["claim-contractors", claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claim_contractors")
        .select(`
          contractor_id,
          profiles!inner(email, full_name)
        `)
        .eq("claim_id", claimId);
      if (error) throw error;
      return data;
    },
    enabled: isOpen,
  });

  // Add contractors to recipients
  contractors?.forEach((contractor: any) => {
    if (contractor.profiles?.email) {
      recipients.push({
        email: contractor.profiles.email,
        name: contractor.profiles.full_name || "Contractor",
        type: "contractor"
      });
    }
  });

  // Fetch referrer
  const { data: referrer } = useQuery({
    queryKey: ["claim-referrer", claim.referrer_id],
    queryFn: async () => {
      if (!claim.referrer_id) return null;
      const { data, error } = await supabase
        .from("referrers")
        .select("email, name")
        .eq("id", claim.referrer_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !!claim.referrer_id,
  });

  // Add referrer to recipients
  if (referrer?.email) {
    recipients.push({
      email: referrer.email,
      name: referrer.name,
      type: "referrer"
    });
  }

  const handleSend = async () => {
    if (!selectedRecipient || !emailSubject || !body) {
      toast.error("Please fill in all fields");
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          to: selectedRecipient.email,
          subject: emailSubject,
          body,
          claimId,
          recipientName: selectedRecipient.name,
          recipientType: selectedRecipient.type,
        }
      });

      if (error) throw error;

      toast.success("Email sent successfully");
      onClose();
      setSelectedRecipient(null);
      setEmailSubject("");
      setBody("");
    } catch (error: any) {
      console.error("Error sending email:", error);
      toast.error(error.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compose Email</DialogTitle>
          <DialogDescription>Send an email to claim contacts</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Load from Template</Label>
            <Select onValueChange={handleTemplateSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select a template (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">-- No template --</SelectItem>
                {emailTemplates?.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {template.name} {template.category && `(${template.category})`}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipient">To</Label>
            <Select
              value={selectedRecipient?.email}
              onValueChange={(email) => {
                const recipient = recipients.find(r => r.email === email);
                setSelectedRecipient(recipient || null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select recipient" />
              </SelectTrigger>
              <SelectContent>
                {recipients.map((recipient) => (
                  <SelectItem key={recipient.email} value={recipient.email}>
                    {recipient.name} ({recipient.type}) - {recipient.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="Email subject"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              placeholder="Type your message here..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[200px]"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}