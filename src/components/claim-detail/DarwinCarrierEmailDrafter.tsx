import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Loader2, Copy, Send, Sparkles } from "lucide-react";
import { useDeclaredPosition } from "@/hooks/useDeclaredPosition";
import { PositionGateBanner } from "./PositionGateBanner";

interface DarwinCarrierEmailDrafterProps {
  claimId: string;
  claim: any;
}

const EMAIL_TYPES = [
  { value: "status_inquiry", label: "Status Inquiry", description: "Request update on claim status" },
  { value: "document_submission", label: "Document Submission", description: "Cover letter for submitted documents" },
  { value: "deadline_reminder", label: "Deadline Reminder", description: "Remind carrier of regulatory deadlines" },
  { value: "payment_follow_up", label: "Payment Follow-Up", description: "Follow up on pending payment" },
  { value: "dispute_response", label: "Dispute Response", description: "Respond to carrier dispute or denial" },
  { value: "inspection_request", label: "Inspection Request", description: "Request re-inspection or joint inspection" },
  { value: "supplement_submission", label: "Supplement Submission", description: "Submit supplemental claim documents" },
  { value: "bad_faith_warning", label: "Bad Faith Warning", description: "Formal notice of potential bad faith" },
];

export const DarwinCarrierEmailDrafter = ({ claimId, claim }: DarwinCarrierEmailDrafterProps) => {
  const { toast } = useToast();
  const [emailType, setEmailType] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [generatedSubject, setGeneratedSubject] = useState("");
  const [generatedBody, setGeneratedBody] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [provisionalOverride, setProvisionalOverride] = useState(false);
  const { position, isLocked, loading: positionLoading } = useDeclaredPosition(claimId);

  const handleGenerate = async () => {
    if (!emailType) {
      toast({
        title: "Select email type",
        description: "Please select the type of email you want to generate",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("darwin-ai-analysis", {
        body: {
          claimId,
          analysisType: "carrier_email_draft",
          additionalContext: {
            emailType,
            userContext: additionalContext,
            emailTypeLabel: EMAIL_TYPES.find(t => t.value === emailType)?.label,
            ...(isLocked && position ? {
              declaredPosition: {
                primary_cause_of_loss: position.primary_cause_of_loss,
                primary_coverage_theory: position.primary_coverage_theory,
                primary_carrier_error: position.primary_carrier_error,
                carrier_dependency_statement: position.carrier_dependency_statement,
              }
            } : {}),
            ...(provisionalOverride ? { provisionalPosition: true } : {}),
          },
          claim,
        },
      });

      if (error) throw error;

      if (data?.result) {
        // Parse subject and body from result
        const result = data.result;
        const subjectMatch = result.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
        const bodyMatch = result.match(/BODY:\s*([\s\S]+)/i);
        
        if (subjectMatch) {
          setGeneratedSubject(subjectMatch[1].trim());
        }
        if (bodyMatch) {
          setGeneratedBody(bodyMatch[1].trim());
        } else {
          setGeneratedBody(result);
        }

        toast({
          title: "Email drafted",
          description: "Darwin has generated your carrier communication",
        });
      }
    } catch (error: any) {
      console.error("Error generating email:", error);
      toast({
        title: "Generation failed",
        description: error.message || "Failed to generate email",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    const fullEmail = `Subject: ${generatedSubject}\n\n${generatedBody}`;
    navigator.clipboard.writeText(fullEmail);
    toast({
      title: "Copied",
      description: "Email copied to clipboard",
    });
  };

  const handleSendToComposer = () => {
    // Store in sessionStorage for the email composer to pick up
    sessionStorage.setItem("draftEmail", JSON.stringify({
      subject: generatedSubject,
      body: generatedBody,
      to: claim.adjuster_email || claim.insurance_email || "",
    }));
    toast({
      title: "Ready to send",
      description: "Email loaded into composer. Navigate to Communications to send.",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          AI Carrier Email Drafter
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <PositionGateBanner
          position={position}
          isLocked={isLocked}
          loading={positionLoading}
          onOverride={() => setProvisionalOverride(true)}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Email Type</Label>
            <Select value={emailType} onValueChange={setEmailType}>
              <SelectTrigger>
                <SelectValue placeholder="Select email type..." />
              </SelectTrigger>
              <SelectContent>
                {EMAIL_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex flex-col">
                      <span>{type.label}</span>
                      <span className="text-xs text-muted-foreground">{type.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Additional Context (optional)</Label>
            <Textarea
              placeholder="Any specific points to address, deadlines to reference, or tone preferences..."
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              className="h-20"
            />
          </div>
        </div>

        <Button onClick={handleGenerate} disabled={isGenerating || !emailType} className="w-full">
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Darwin is drafting...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Email
            </>
          )}
        </Button>

        {generatedSubject && (
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={generatedSubject}
                onChange={(e) => setGeneratedSubject(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea
                value={generatedBody}
                onChange={(e) => setGeneratedBody(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCopy}>
                <Copy className="h-4 w-4 mr-2" />
                Copy to Clipboard
              </Button>
              <Button onClick={handleSendToComposer}>
                <Send className="h-4 w-4 mr-2" />
                Load into Composer
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
