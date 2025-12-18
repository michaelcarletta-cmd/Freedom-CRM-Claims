import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Loader2, RefreshCw, FileText, DollarSign, Calendar, ClipboardList, Save, MessageSquare } from "lucide-react";
import { format } from "date-fns";

interface DarwinClaimBriefingProps {
  claimId: string;
  claim: any;
}

export const DarwinClaimBriefing = ({ claimId, claim }: DarwinClaimBriefingProps) => {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [contextData, setContextData] = useState<any>(null);
  const [darwinNotes, setDarwinNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesChanged, setNotesChanged] = useState(false);
  const { toast } = useToast();

  // Load claim context data on mount
  useEffect(() => {
    loadContextData();
    loadDarwinNotes();
  }, [claimId]);

  const loadContextData = async () => {
    const [
      settlementResult,
      checksResult,
      tasksResult,
      inspectionsResult,
      emailsResult,
      updatesResult,
      adjustersResult
    ] = await Promise.all([
      supabase.from('claim_settlements').select('*').eq('claim_id', claimId).order('created_at', { ascending: false }).limit(1),
      supabase.from('claim_checks').select('*').eq('claim_id', claimId),
      supabase.from('tasks').select('*').eq('claim_id', claimId).order('due_date'),
      supabase.from('inspections').select('*').eq('claim_id', claimId),
      supabase.from('emails').select('*').eq('claim_id', claimId).order('created_at', { ascending: false }).limit(10),
      supabase.from('claim_updates').select('*').eq('claim_id', claimId).order('created_at', { ascending: false }).limit(10),
      supabase.from('claim_adjusters').select('*').eq('claim_id', claimId)
    ]);

    setContextData({
      settlement: settlementResult.data?.[0] || null,
      checks: checksResult.data || [],
      tasks: tasksResult.data || [],
      inspections: inspectionsResult.data || [],
      emails: emailsResult.data || [],
      updates: updatesResult.data || [],
      adjusters: adjustersResult.data || []
    });
  };

  const loadDarwinNotes = async () => {
    // Load from darwin_analysis_results with type 'context_notes'
    const { data } = await supabase
      .from('darwin_analysis_results')
      .select('result')
      .eq('claim_id', claimId)
      .eq('analysis_type', 'context_notes')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (data?.result) {
      setDarwinNotes(data.result);
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      // Delete existing context notes and insert new one
      await supabase
        .from('darwin_analysis_results')
        .delete()
        .eq('claim_id', claimId)
        .eq('analysis_type', 'context_notes');

      const { error } = await supabase
        .from('darwin_analysis_results')
        .insert({
          claim_id: claimId,
          analysis_type: 'context_notes',
          result: darwinNotes,
          input_summary: 'User-provided context notes for Darwin AI'
        });

      if (error) throw error;

      setNotesChanged(false);
      toast({
        title: "Notes Saved",
        description: "Darwin will now consider this context in future analyses."
      });
    } catch (error: any) {
      console.error('Error saving notes:', error);
      toast({
        title: "Error",
        description: "Failed to save notes",
        variant: "destructive"
      });
    } finally {
      setSavingNotes(false);
    }
  };

  const handleGenerateBriefing = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('darwin-ai-analysis', {
        body: {
          claimId,
          analysisType: 'claim_briefing',
          claim,
          contextData,
          darwinNotes // Include user notes in the briefing
        }
      });

      if (error) throw error;

      setBriefing(data.analysis);

      toast({
        title: "Briefing Generated",
        description: "Darwin has analyzed the claim and prepared your briefing."
      });
    } catch (error: any) {
      console.error('Briefing generation error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate briefing",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Calculate summary stats
  const totalRCV = contextData?.settlement ? 
    (contextData.settlement.replacement_cost_value || 0) + 
    (contextData.settlement.other_structures_rcv || 0) + 
    (contextData.settlement.pwi_rcv || 0) : 0;
  
  const totalChecks = contextData?.checks?.reduce((sum: number, c: any) => sum + (c.amount || 0), 0) || 0;
  const pendingTasks = contextData?.tasks?.filter((t: any) => t.status === 'pending').length || 0;
  const completedTasks = contextData?.tasks?.filter((t: any) => t.status === 'completed').length || 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Claim Briefing</CardTitle>
          </div>
          <Button 
            onClick={handleGenerateBriefing} 
            disabled={loading}
            size="sm"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Generate AI Briefing
              </>
            )}
          </Button>
        </div>
        <CardDescription>
          Get caught up on this claim with a comprehensive AI-powered summary
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Context Notes for Darwin */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Context Notes for Darwin
            </h4>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveNotes}
              disabled={savingNotes || !notesChanged}
            >
              {savingNotes ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Notes
            </Button>
          </div>
          <Textarea
            placeholder="Add any important context Darwin should know about this claim... (e.g., verbal conversations with adjuster, special circumstances, strategy notes, client preferences, important deadlines, etc.)"
            value={darwinNotes}
            onChange={(e) => {
              setDarwinNotes(e.target.value);
              setNotesChanged(true);
            }}
            className="min-h-[120px]"
          />
          <p className="text-xs text-muted-foreground">
            These notes will be included in all Darwin AI analyses for this claim
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              Total RCV
            </div>
            <div className="text-lg font-semibold">
              ${totalRCV.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <FileText className="h-4 w-4" />
              Checks Received
            </div>
            <div className="text-lg font-semibold">
              ${totalChecks.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <ClipboardList className="h-4 w-4" />
              Tasks
            </div>
            <div className="text-lg font-semibold">
              {pendingTasks} pending / {completedTasks} done
            </div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              Inspections
            </div>
            <div className="text-lg font-semibold">
              {contextData?.inspections?.length || 0} scheduled
            </div>
          </div>
        </div>

        {/* Key Claim Info */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-muted-foreground">Key Information</h4>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={claim.is_closed ? "secondary" : "default"}>
                {claim.is_closed ? "Closed" : claim.status || "Open"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Loss Type</span>
              <span>{claim.loss_type || "Not specified"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Loss Date</span>
              <span>{claim.loss_date ? format(new Date(claim.loss_date + 'T12:00:00'), 'MMM d, yyyy') : "Not specified"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Insurance Company</span>
              <span>{claim.insurance_company || "Not specified"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Primary Adjuster</span>
              <span>
                {contextData?.adjusters?.find((a: any) => a.is_primary)?.adjuster_name || 
                 contextData?.adjusters?.[0]?.adjuster_name || 
                 "Not assigned"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Recent Activity</span>
              <span>{contextData?.updates?.length || 0} updates, {contextData?.emails?.length || 0} emails</span>
            </div>
          </div>
        </div>

        {/* AI Generated Briefing */}
        {briefing && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              AI Analysis & Summary
            </h4>
            <ScrollArea className="h-[300px]">
              <div className="prose prose-sm dark:prose-invert max-w-none p-4 bg-muted/30 rounded-lg whitespace-pre-wrap">
                {briefing}
              </div>
            </ScrollArea>
          </div>
        )}

        {!briefing && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Click "Generate AI Briefing" to get a comprehensive summary of this claim</p>
            <p className="text-sm mt-1">Darwin will analyze all claim data and provide strategic insights</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};