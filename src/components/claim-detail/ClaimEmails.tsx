import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Mail, Send, Loader2, MailOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmailComposer } from "@/components/EmailComposer";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

// Decode base64 to UTF-8 string properly
function base64ToUtf8(base64: string): string {
  try {
    const cleaned = base64.replace(/[\r\n\s]/g, '');
    const binaryString = atob(cleaned);
    // Convert binary string to Uint8Array for proper UTF-8 decoding
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    // Use TextDecoder for proper UTF-8 handling
    return new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    console.error('Base64 UTF-8 decode error:', e);
    return base64;
  }
}

// Clean up email text for display
function cleanEmailText(text: string): string {
  return text
    // Convert Windows line endings to Unix
    .replace(/\r\n/g, '\n')
    // Remove PNG binary data sections (raw image data that leaked into text)
    // Match from PNG header markers through to end of binary data
    .replace(/\x89PNG[\s\S]*?(?:IEND|$)/g, '[Image]')
    .replace(/PNG\s*\n?\s*IHDR[\s\S]*?(?:IEND|$)/g, '[Image]')
    // Remove lines that are mostly non-printable characters (binary data)
    .replace(/^[^\x20-\x7E\n]*[\x00-\x1F\x7F-\xFF]{10,}[^\x20-\x7E\n]*$/gm, '')
    // Remove gibberish sequences (20+ non-ASCII chars in a row)
    .replace(/[^\x20-\x7E\n\r\t]{20,}/g, '')
    // Remove email reply/thread content (everything after "From:" header in replies)
    .replace(/\n\nFrom:[\s\S]*$/m, '')
    // Remove image placeholders like [A computer and phone with a screen...]
    .replace(/\[[^\]]*Description automatically generated\][^\n]*/g, '')
    // Remove CID image references
    .replace(/\[cid:[^\]]+\]/g, '')
    // Remove mailto: links embedded in text
    .replace(/<mailto:[^>]+>/g, '')
    // Remove http/https links embedded in text  
    .replace(/<https?:\/\/[^>]+>/g, '')
    // Clean up multiple newlines
    .replace(/\n{3,}/g, '\n\n')
    // Clean up multiple [Image] placeholders
    .replace(/(\[Image\]\s*)+/g, '[Image]\n')
    .trim();
}

// Check if text is readable (mostly printable ASCII)
function isReadableText(text: string): boolean {
  if (!text || text.length < 10) return false;
  // Count printable characters (space through tilde, plus common whitespace)
  const printable = text.match(/[\x20-\x7E\n\r\t]/g);
  const ratio = printable ? printable.length / text.length : 0;
  return ratio > 0.85; // At least 85% printable characters
}

// Decode base64 encoded email body (for legacy incorrectly stored emails)
function decodeEmailBody(body: string): string {
  if (!body) return '';
  
  // Check if body contains MIME boundary markers (multipart message)
  const boundaryMatch = body.match(/--_[A-Za-z0-9]+_/);
  
  if (boundaryMatch) {
    const boundary = boundaryMatch[0];
    const parts = body.split(boundary);
    
    if (parts.length > 0 && parts[0].trim()) {
      const firstPart = parts[0].trim();
      
      // Check if it's already readable text (not base64)
      if (isReadableText(firstPart)) {
        return cleanEmailText(firstPart);
      }
      
      // If not readable, try base64 decoding
      const cleaned = firstPart.replace(/[\r\n\s]/g, '');
      if (/^[A-Za-z0-9+/=]+$/.test(cleaned) && cleaned.length > 50) {
        try {
          const decoded = base64ToUtf8(cleaned);
          if (isReadableText(decoded)) {
            return cleanEmailText(decoded);
          }
        } catch (e) {
          // Not valid base64
        }
      }
    }
    
    // Try to find text/plain section in MIME parts
    for (const part of parts) {
      if (part.includes('Content-Type: text/plain')) {
        const encodingMatch = part.match(/Content-Transfer-Encoding:\s*(\S+)/i);
        const encoding = encodingMatch ? encodingMatch[1].toLowerCase() : '';
        
        const contentParts = part.split(/\n\n/);
        if (contentParts.length > 1) {
          let content = contentParts.slice(1).join('\n\n').trim();
          content = content.replace(/\n--_[A-Za-z0-9_]+--?\s*$/g, '').trim();
          
          if (encoding === 'base64') {
            return cleanEmailText(base64ToUtf8(content));
          }
          return cleanEmailText(content);
        }
      }
    }
  }
  
  // Check if body looks like pure base64 (no MIME structure, no readable text)
  if (!isReadableText(body)) {
    const cleaned = body.replace(/[\r\n\s]/g, '');
    if (/^[A-Za-z0-9+/=]+$/.test(cleaned) && cleaned.length > 100 && cleaned.length % 4 === 0) {
      try {
        const decoded = base64ToUtf8(cleaned);
        if (decoded && !decoded.includes('\x00') && isReadableText(decoded)) {
          return cleanEmailText(decoded);
        }
      } catch (e) {
        // Not valid base64
      }
    }
  }
  
  // Check for Content-Transfer-Encoding header in the body
  if (body.includes('Content-Transfer-Encoding: base64') || body.includes('Content-Transfer-Encoding:base64')) {
    const base64Match = body.match(/Content-Transfer-Encoding:\s*base64\s*\n\n([A-Za-z0-9+/=\s]+)/i);
    if (base64Match) {
      return cleanEmailText(base64ToUtf8(base64Match[1]));
    }
  }
  
  return cleanEmailText(body);
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