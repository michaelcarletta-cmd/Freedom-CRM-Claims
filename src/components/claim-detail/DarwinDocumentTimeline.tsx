import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy, Clock, RefreshCw, FileText, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DarwinDocumentTimelineProps {
  claimId: string;
  claim: any;
}

export const DarwinDocumentTimeline = ({ claimId, claim }: DarwinDocumentTimelineProps) => {
  const [loading, setLoading] = useState(false);
  const [timeline, setTimeline] = useState<string | null>(null);
  const [lastGenerated, setLastGenerated] = useState<Date | null>(null);
  const [fileCount, setFileCount] = useState(0);

  useEffect(() => {
    loadPreviousTimeline();
  }, [claimId]);

  const loadPreviousTimeline = async () => {
    const { data } = await supabase
      .from('darwin_analysis_results')
      .select('*')
      .eq('claim_id', claimId)
      .eq('analysis_type', 'document_timeline')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setTimeline(data.result);
      setLastGenerated(new Date(data.created_at));
    }
  };

  const generateTimeline = async () => {
    setLoading(true);
    try {
      // Get all claim files with extracted text
      const { data: files } = await supabase
        .from('claim_files')
        .select('id, file_name, file_path, file_type, extracted_text, uploaded_at, document_classification, claim_folders(name)')
        .eq('claim_id', claimId);

      const filesWithText = (files || []).filter(f => f.extracted_text && f.extracted_text.length > 50);
      setFileCount(files?.length || 0);

      // Also get emails
      const { data: emails } = await supabase
        .from('emails')
        .select('id, subject, recipient_email, created_at, body')
        .eq('claim_id', claimId)
        .order('created_at', { ascending: true });

      // Build document summaries for AI to extract dates from
      const docSummaries = filesWithText.map(f => ({
        file_name: f.file_name,
        classification: (f as any).document_classification || 'unknown',
        folder: (f as any).claim_folders?.name || 'Unfiled',
        uploaded_at: f.uploaded_at,
        // Send first 2000 chars of extracted text for date extraction
        text_excerpt: f.extracted_text!.substring(0, 2000),
      }));

      const emailSummaries = (emails || []).map(e => ({
        subject: e.subject,
        recipient: e.recipient_email,
        date: e.created_at,
        body_excerpt: (e.body || '').substring(0, 500),
      }));

      const { data, error } = await supabase.functions.invoke('darwin-ai-analysis', {
        body: {
          claimId,
          analysisType: 'document_timeline',
          additionalContext: {
            documents: docSummaries,
            emails: emailSummaries,
            totalFiles: files?.length || 0,
            filesWithText: filesWithText.length,
          }
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setTimeline(data.result);
      setLastGenerated(new Date());

      const { data: userData } = await supabase.auth.getUser();
      await supabase.from('darwin_analysis_results').insert({
        claim_id: claimId,
        analysis_type: 'document_timeline',
        input_summary: `${files?.length || 0} files, ${emails?.length || 0} emails scanned`,
        result: data.result,
        created_by: userData.user?.id
      });

      toast.success(`Timeline built from ${filesWithText.length} documents and ${emails?.length || 0} emails`);
    } catch (err: any) {
      console.error("Timeline generation error:", err);
      toast.error(err.message || "Failed to generate timeline");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (timeline) {
      navigator.clipboard.writeText(timeline);
      toast.success("Timeline copied");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Document-Based Timeline
              {timeline && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Clock className="h-3 w-3" />
                  Generated
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Scans all uploaded documents and emails to extract dates and build a chronological timeline
            </CardDescription>
          </div>
          {timeline && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={generateTimeline} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} />
                Rebuild
              </Button>
              <Button variant="outline" size="sm" onClick={copyToClipboard}>
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!timeline ? (
          <div className="text-center py-6 space-y-3">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Darwin will scan all uploaded documents and emails to extract key dates and build a complete chronological timeline.
            </p>
            <Button onClick={generateTimeline} disabled={loading} className="gap-2">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scanning documents...
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4" />
                  Build Timeline from Documents
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {lastGenerated && (
              <div className="text-xs text-muted-foreground">
                Last generated: {lastGenerated.toLocaleString()}
              </div>
            )}
            <ScrollArea className="h-[400px] border rounded-md">
              <pre className="p-4 text-sm whitespace-pre-wrap font-mono bg-muted/30">
                {timeline}
              </pre>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DarwinDocumentTimeline;
