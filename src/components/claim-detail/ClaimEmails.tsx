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

// Detect if content is binary/image data
function isBinaryContent(text: string): boolean {
  // Check for PNG header
  if (text.includes('\x89PNG') || text.includes('PNG') && text.includes('IHDR')) {
    return true;
  }
  // Check for JPEG header
  if (text.includes('\xFF\xD8\xFF') || text.includes('JFIF')) {
    return true;
  }
  // Check for high concentration of non-printable characters
  const nonPrintable = text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g);
  if (nonPrintable && nonPrintable.length > text.length * 0.1) {
    return true;
  }
  return false;
}

// Clean up email text for display
function cleanEmailText(text: string): string {
  // If the whole thing looks like binary data, return a placeholder
  if (isBinaryContent(text)) {
    return '[Email contains image/attachment - view original email for full content]';
  }
  
  return text
    // Convert Windows line endings to Unix
    .replace(/\r\n/g, '\n')
    // Remove PNG binary data sections (raw image data that leaked into text)
    .replace(/PNG[\s\S]*?IEND[^\n]*/g, '[Image]')
    .replace(/\x89PNG[\s\S]*?IEND[^\n]*/g, '[Image]')
    // Remove any content that looks like raw image data (IHDR, tEXt, IDAT markers)
    .replace(/IHDR[\x00-\xFF]*?(?=\n\n|$)/g, '[Image]')
    // Remove gibberish that results from binary data being interpreted as text
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

// Decode base64 encoded email body (for legacy incorrectly stored emails)
function decodeEmailBody(body: string): string {
  if (!body) return '';
  
  // Check if body contains MIME boundary markers (multipart message)
  const boundaryMatch = body.match(/--_[A-Za-z0-9]+_/);
  
  if (boundaryMatch) {
    // This is raw MIME content - the text before the first boundary is base64 encoded plain text
    const boundary = boundaryMatch[0];
    const parts = body.split(boundary);
    
    if (parts.length > 0 && parts[0].trim()) {
      // First part before boundary is usually the text/plain base64 content
      const firstPart = parts[0].trim();
      
      // Check if it looks like base64 (only base64 chars)
      const cleaned = firstPart.replace(/[\r\n\s]/g, '');
      if (/^[A-Za-z0-9+/=]+$/.test(cleaned) && cleaned.length > 50) {
        const decoded = base64ToUtf8(cleaned);
        return cleanEmailText(decoded);
      }
    }
    
    // Try to find text/plain section in MIME parts
    for (const part of parts) {
      if (part.includes('Content-Type: text/plain')) {
        const encodingMatch = part.match(/Content-Transfer-Encoding:\s*(\S+)/i);
        const encoding = encodingMatch ? encodingMatch[1].toLowerCase() : '';
        
        // Get content after headers (double newline)
        const contentParts = part.split(/\n\n/);
        if (contentParts.length > 1) {
          let content = contentParts.slice(1).join('\n\n').trim();
          // Remove trailing boundary
          content = content.replace(/\n--_[A-Za-z0-9_]+--?\s*$/g, '').trim();
          
          if (encoding === 'base64') {
            return cleanEmailText(base64ToUtf8(content));
          }
          return cleanEmailText(content);
        }
      }
    }
  }
  
  // Check if body looks like pure base64 (no MIME structure)
  const cleaned = body.replace(/[\r\n\s]/g, '');
  if (/^[A-Za-z0-9+/=]+$/.test(cleaned) && cleaned.length > 100 && cleaned.length % 4 === 0) {
    try {
      const decoded = base64ToUtf8(cleaned);
      // Validate it's readable text
      if (decoded && !decoded.includes('\x00')) {
        return cleanEmailText(decoded);
      }
    } catch (e) {
      // Not valid base64
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