import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Copy,
  RefreshCw,
  Info,
  XCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DarwinComplianceCheckerProps {
  claimId: string;
  claim?: any;
  initialText?: string;
  onTextUpdate?: (text: string) => void;
}

interface ComplianceIssue {
  id: string;
  severity: "error" | "warning" | "info";
  category: string;
  originalText: string;
  issue: string;
  suggestion: string;
  regulation?: string;
}

// Common risky phrases and their compliant alternatives
const RISKY_PATTERNS: Array<{
  pattern: RegExp;
  category: string;
  severity: "error" | "warning" | "info";
  issue: string;
  suggestion: string;
  regulation?: string;
}> = [
  // UPL (Unauthorized Practice of Law) concerns
  {
    pattern: /\b(you (should|must|need to) sue|file a lawsuit|legal action|take them to court)\b/gi,
    category: "UPL Risk",
    severity: "error",
    issue: "This language could be construed as legal advice, which public adjusters are not licensed to provide.",
    suggestion: "Consider consulting with an attorney regarding your legal options.",
    regulation: "Most states prohibit public adjusters from providing legal advice."
  },
  {
    pattern: /\b(i('m| am) not (a|your) (lawyer|attorney)|this is not legal advice)\b/gi,
    category: "UPL Disclaimer",
    severity: "info",
    issue: "Good practice - includes UPL disclaimer.",
    suggestion: "Consider adding at the beginning of correspondence.",
  },
  // Promise/Guarantee language
  {
    pattern: /\b(guarantee|promise|will definitely|100%|certain(ly)? (will|get))\b/gi,
    category: "Guarantee Language",
    severity: "warning",
    issue: "Guarantee language may create unrealistic expectations and potential liability.",
    suggestion: "Replace with: 'We will work diligently to...' or 'Based on our experience...'",
  },
  // Timeline promises
  {
    pattern: /\b(will (be|get) (done|resolved|settled|paid) (in|within|by))\b/gi,
    category: "Timeline Promise",
    severity: "warning",
    issue: "Specific timeline promises may not be achievable due to carrier delays.",
    suggestion: "Use: 'Our goal is to...' or 'Typically, this process takes...'",
  },
  // Bad faith allegations (need careful wording)
  {
    pattern: /\b(bad faith|acting in bad faith|fraudulent)\b/gi,
    category: "Bad Faith Allegation",
    severity: "warning",
    issue: "Bad faith allegations should be carefully documented with specific violations cited.",
    suggestion: "Cite specific regulatory violations (e.g., 'failure to respond within the 15-day period required by N.J.A.C. 11:2-17.6').",
    regulation: "NJ/PA UCSPA regulations"
  },
  // Depreciation language
  {
    pattern: /\b(depreciation (is|should be) (illegal|wrong|improper))\b/gi,
    category: "Depreciation Claims",
    severity: "warning",
    issue: "Depreciation is generally allowed per policy terms. Focus on recoverability instead.",
    suggestion: "State: 'The recoverable depreciation becomes due upon completion of repairs per policy terms.'",
  },
  // DTPA/UCSPA Violations
  {
    pattern: /\b(unfair (claims?|settlement)? practice|deceptive practice)\b/gi,
    category: "Regulatory Citation",
    severity: "info",
    issue: "When citing unfair claims practices, reference specific regulations.",
    suggestion: "PA: 31 Pa. Code § 146.5 | NJ: N.J.A.C. 11:2-17.6",
  },
  // Threatening language
  {
    pattern: /\b(we will (report|file a complaint)|insurance commissioner|regulatory complaint)\b/gi,
    category: "Regulatory Threat",
    severity: "info",
    issue: "Regulatory escalation threats should be specific and backed by documented violations.",
    suggestion: "Document the specific regulation violated before making this statement.",
  },
  // Coverage opinions
  {
    pattern: /\b(this (is|should be) covered|coverage (is|should be) clear)\b/gi,
    category: "Coverage Opinion",
    severity: "warning",
    issue: "Coverage determinations are ultimately made by the carrier and courts.",
    suggestion: "Use: 'Based on our reading of the policy, this loss appears to be covered under...'",
  },
  // Personal pronoun overuse (professional tone)
  {
    pattern: /\bi think|in my opinion|i believe|i feel\b/gi,
    category: "Professional Tone",
    severity: "info",
    issue: "Personal opinions may weaken professional authority.",
    suggestion: "Use: 'Industry standards indicate...' or 'Per the policy terms...'",
  },
  // Emotional language
  {
    pattern: /\b(ridiculous|absurd|outrageous|unbelievable|shocking)\b/gi,
    category: "Emotional Language",
    severity: "warning",
    issue: "Emotional language may undermine professional credibility.",
    suggestion: "Use factual, measured language: 'This interpretation appears inconsistent with...'",
  },
];

export const DarwinComplianceChecker = ({ 
  claimId, 
  claim, 
  initialText = "", 
  onTextUpdate 
}: DarwinComplianceCheckerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState(initialText);
  const [issues, setIssues] = useState<ComplianceIssue[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  const analyzeText = async () => {
    if (!text.trim()) {
      toast.error("Please enter text to analyze");
      return;
    }

    setIsAnalyzing(true);
    const foundIssues: ComplianceIssue[] = [];
    let issueId = 0;

    // Local pattern matching
    for (const rule of RISKY_PATTERNS) {
      const matches = text.matchAll(rule.pattern);
      for (const match of matches) {
        foundIssues.push({
          id: `issue-${issueId++}`,
          severity: rule.severity,
          category: rule.category,
          originalText: match[0],
          issue: rule.issue,
          suggestion: rule.suggestion,
          regulation: rule.regulation,
        });
      }
    }

    // AI-powered analysis for more nuanced issues
    try {
      const state = claim?.policyholder_state || "PA";
      const { data, error } = await supabase.functions.invoke("darwin-ai-analysis", {
        body: {
          type: "compliance_check",
          claimId,
          text,
          state,
        },
      });

      if (!error && data?.issues) {
        data.issues.forEach((aiIssue: any) => {
          foundIssues.push({
            id: `ai-issue-${issueId++}`,
            severity: aiIssue.severity || "warning",
            category: aiIssue.category || "AI Analysis",
            originalText: aiIssue.originalText || "",
            issue: aiIssue.issue,
            suggestion: aiIssue.suggestion,
            regulation: aiIssue.regulation,
          });
        });
      }
    } catch (e) {
      console.log("AI compliance check optional enhancement skipped");
    }

    setIssues(foundIssues);
    setHasAnalyzed(true);
    setIsAnalyzing(false);

    if (foundIssues.length === 0) {
      toast.success("No compliance issues found!");
    } else {
      toast.info(`Found ${foundIssues.length} item(s) to review`);
    }
  };

  const applySuggestion = (issue: ComplianceIssue) => {
    if (!issue.originalText) return;
    
    // Simple replacement - in real use, would need more sophisticated handling
    const newText = text.replace(issue.originalText, `[REVISED: ${issue.suggestion}]`);
    setText(newText);
    onTextUpdate?.(newText);
    
    // Remove this issue from the list
    setIssues(prev => prev.filter(i => i.id !== issue.id));
    toast.success("Suggestion applied - please review and finalize the text");
  };

  const getSeverityIcon = (severity: ComplianceIssue["severity"]) => {
    switch (severity) {
      case "error": return <XCircle className="h-4 w-4 text-red-600" />;
      case "warning": return <AlertTriangle className="h-4 w-4 text-amber-600" />;
      case "info": return <Info className="h-4 w-4 text-blue-600" />;
    }
  };

  const getSeverityStyle = (severity: ComplianceIssue["severity"]) => {
    switch (severity) {
      case "error": return "border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800";
      case "warning": return "border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800";
      case "info": return "border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800";
    }
  };

  const errorCount = issues.filter(i => i.severity === "error").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;
  const infoCount = issues.filter(i => i.severity === "info").length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Compliance-Aware Messaging
                <Badge variant="secondary" className="ml-2">PA/NJ</Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                {hasAnalyzed && (
                  <>
                    {errorCount > 0 && <Badge variant="destructive">{errorCount} errors</Badge>}
                    {warningCount > 0 && <Badge className="bg-amber-100 text-amber-700">{warningCount} warnings</Badge>}
                    {errorCount === 0 && warningCount === 0 && <Badge className="bg-green-100 text-green-700">Clear</Badge>}
                  </>
                )}
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste your email, letter, or communication below. Darwin will flag risky language and suggest compliant alternatives based on PA/NJ regulations.
            </p>

            {/* Text Input */}
            <div className="space-y-2">
              <Textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  onTextUpdate?.(e.target.value);
                }}
                placeholder="Paste your communication text here..."
                className="min-h-[150px] font-mono text-sm"
              />
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">
                  {text.length} characters
                </span>
                <Button
                  onClick={analyzeText}
                  disabled={isAnalyzing || !text.trim()}
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Check Compliance
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Results */}
            {hasAnalyzed && (
              <div className="space-y-3">
                {issues.length === 0 ? (
                  <Alert className="border-green-200 bg-green-50 dark:bg-green-950">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800 dark:text-green-200">
                      No compliance issues detected. Your message appears to follow best practices.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-3">
                      {issues.map((issue) => (
                        <div
                          key={issue.id}
                          className={`p-3 rounded-lg border ${getSeverityStyle(issue.severity)}`}
                        >
                          <div className="flex items-start gap-2">
                            {getSeverityIcon(issue.severity)}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{issue.category}</span>
                                <Badge variant="outline" className="text-xs">
                                  {issue.severity}
                                </Badge>
                              </div>
                              
                              {issue.originalText && (
                                <p className="text-xs mt-1 font-mono bg-muted p-1 rounded">
                                  "{issue.originalText}"
                                </p>
                              )}
                              
                              <p className="text-sm mt-2">{issue.issue}</p>
                              
                              <div className="mt-2 p-2 bg-background rounded border">
                                <p className="text-xs text-muted-foreground mb-1">Suggested revision:</p>
                                <p className="text-sm text-green-700 dark:text-green-400">{issue.suggestion}</p>
                              </div>
                              
                              {issue.regulation && (
                                <p className="text-xs text-muted-foreground mt-2 italic">
                                  Reference: {issue.regulation}
                                </p>
                              )}
                              
                              <div className="flex gap-2 mt-2">
                                {issue.originalText && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => applySuggestion(issue)}
                                  >
                                    <RefreshCw className="h-3 w-3 mr-1" />
                                    Apply Suggestion
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    navigator.clipboard.writeText(issue.suggestion);
                                    toast.success("Suggestion copied");
                                  }}
                                >
                                  <Copy className="h-3 w-3 mr-1" />
                                  Copy
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}

            {/* Quick Tips */}
            <div className="pt-3 border-t">
              <h4 className="text-sm font-medium mb-2">Quick Compliance Tips</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Avoid legal advice - direct clients to attorneys for legal questions</li>
                <li>• Don't guarantee outcomes or specific timelines</li>
                <li>• Cite specific regulations when alleging violations (PA: 31 Pa. Code § 146.5)</li>
                <li>• Use measured, professional language - avoid emotional terms</li>
                <li>• Document everything for audit trail compliance</li>
              </ul>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};
