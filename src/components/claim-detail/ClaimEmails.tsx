import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Mail, Send, Loader2, MailOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmailComposer } from "@/components/EmailComposer";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

// Decode base64 encoded email body (for legacy incorrectly stored emails)
function decodeEmailBody(body: string): string {
  if (!body) return '';
  
  // Check if body looks like raw MIME content with base64
  const hasBase64Content = body.includes('Content-Transfer-Encoding: base64') || 
    body.includes('Content-Transfer-Encoding:base64');
  
  if (hasBase64Content) {
    // Try to extract the base64 portion after Content-Transfer-Encoding: base64
    const parts = body.split(/Content-Transfer-Encoding:\s*base64/i);
    if (parts.length > 1) {
      // Find the text/plain section first
      const textPlainMatch = body.match(/Content-Type: text\/plain[^\n]*\nContent-Transfer-Encoding:\s*base64\s*\n\n([A-Za-z0-9+/=\s]+)/i);
      if (textPlainMatch) {
        try {
          const cleaned = textPlainMatch[1].replace(/[\r\n\s]/g, '');
          return atob(cleaned);
        } catch (e) {
          console.error('Base64 decode failed for text/plain:', e);
        }
      }
      
      // Fall back to first base64 block
      const base64Match = parts[1].match(/\n\n([A-Za-z0-9+/=\s]+)/);
      if (base64Match) {
        try {
          const cleaned = base64Match[1].replace(/[\r\n\s]/g, '');
          // Check if it looks like valid base64
          if (cleaned.length > 0 && cleaned.length % 4 === 0) {
            const decoded = atob(cleaned);
            // Check if result looks like HTML - if so, strip tags
            if (decoded.startsWith('<html') || decoded.startsWith('<!DOCTYPE')) {
              return decoded
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/p>/gi, '\n\n')
                .replace(/<\/div>/gi, '\n')
                .replace(/<[^>]*>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
            }
            return decoded;
          }
        } catch (e) {
          console.error('Base64 decode failed:', e);
        }
      }
    }
  }
  
  // Also check for pure base64 strings (no headers)
  const cleaned = body.replace(/[\r\n\s]/g, '');
  if (/^[A-Za-z0-9+/=]+$/.test(cleaned) && cleaned.length > 100 && cleaned.length % 4 === 0) {
    try {
      const decoded = atob(cleaned);
      // Validate it's readable text
      if (/^[\x20-\x7E\n\r\t]+$/.test(decoded.substring(0, 100))) {
        return decoded;
      }
    } catch (e) {
      // Not valid base64, return original
    }
  }
  
  return body;
}

interface ClaimEmailsProps {
  claimId: string;
  claim: any;
}

export const ClaimEmails = ({ claimId, claim }: ClaimEmailsProps) => {
  const [isComposerOpen, setIsComposerOpen] = useState(false);

  const { data: emails, isLoading } = useQuery({
    queryKey: ["emails", claimId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("*")
        .eq("claim_id", claimId)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Decode email bodies that may be incorrectly stored as base64
  const decodedEmails = useMemo(() => {
    if (!emails) return [];
    return emails.map(email => ({
      ...email,
      decodedBody: decodeEmailBody(email.body)
    }));
  }, [emails]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Email Communications</h3>
        <Button 
          className="bg-primary hover:bg-primary/90"
          onClick={() => setIsComposerOpen(true)}
        >
          <Send className="h-4 w-4 mr-2" />
          Compose Email
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : decodedEmails && decodedEmails.length > 0 ? (
        <div className="space-y-3">
          {decodedEmails.map((email) => {
            const isInbound = email.recipient_type === 'inbound';
            return (
              <div key={email.id} className={`p-4 rounded-lg border transition-colors ${isInbound ? 'border-green-500/30 bg-green-500/5 hover:bg-green-500/10' : 'border-border hover:bg-muted/30'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {isInbound ? (
                      <MailOpen className="h-4 w-4 text-green-600" />
                    ) : (
                      <Mail className="h-4 w-4 text-primary" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">{email.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {isInbound ? 'From' : 'To'}: {email.recipient_name || email.recipient_email} ({email.recipient_email})
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(email.sent_at), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                    {isInbound ? (
                      <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 border-green-500/30">
                        Inbound
                      </Badge>
                    ) : email.recipient_type && (
                      <Badge variant="outline" className="text-xs">
                        {email.recipient_type}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded p-3">
                  {email.decodedBody}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          No emails logged yet. Click "Compose Email" to send one.
        </div>
      )}

      <EmailComposer
        isOpen={isComposerOpen}
        onClose={() => setIsComposerOpen(false)}
        claimId={claimId}
        claim={claim}
      />
    </div>
  );
};