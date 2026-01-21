import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Bell, Loader2, RefreshCw, Check, X, Phone, Mail, 
  FileText, Calendar, AlertTriangle, Clock, ChevronRight 
} from "lucide-react";
import { format, formatDistanceToNow, addDays } from "date-fns";

interface DarwinSmartFollowUpsProps {
  claimId: string;
  claim: any;
}

interface FollowUpRecommendation {
  id: string;
  recommendation_type: string;
  priority: string;
  recommended_date: string;
  reason: string;
  target_recipient: string | null;
  ai_confidence: number;
  is_completed: boolean;
  dismissed: boolean;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-muted text-muted-foreground'
};

const TYPE_ICONS: Record<string, any> = {
  call: Phone,
  email: Mail,
  document_request: FileText,
  inspection_schedule: Calendar,
  escalation: AlertTriangle
};

export const DarwinSmartFollowUps = ({ claimId, claim }: DarwinSmartFollowUpsProps) => {
  const [recommendations, setRecommendations] = useState<FollowUpRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    loadRecommendations();
  }, [claimId]);

  const loadRecommendations = async () => {
    setLoadingData(true);
    try {
      const { data, error } = await supabase
        .from('smart_follow_up_recommendations')
        .select('*')
        .eq('claim_id', claimId)
        .eq('dismissed', false)
        .order('recommended_date', { ascending: true });

      if (error) throw error;
      setRecommendations(data || []);
    } catch (error) {
      console.error('Error loading recommendations:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const generateRecommendations = async () => {
    setLoading(true);
    toast.info('Analyzing claim for smart follow-up opportunities...');

    try {
      const { data, error } = await supabase.functions.invoke('darwin-ai-analysis', {
        body: {
          claimId,
          analysisType: 'smart_follow_ups'
        }
      });

      if (error) throw error;

      // Parse recommendations from AI response and save
      const aiRecommendations = data.recommendations || [];
      
      for (const rec of aiRecommendations) {
        await supabase.from('smart_follow_up_recommendations').insert({
          claim_id: claimId,
          recommendation_type: rec.type || 'email',
          priority: rec.priority || 'medium',
          recommended_date: rec.date || addDays(new Date(), 3).toISOString(),
          reason: rec.reason,
          target_recipient: rec.recipient,
          ai_confidence: rec.confidence || 0.8
        });
      }

      await loadRecommendations();
      toast.success(`Generated ${aiRecommendations.length} follow-up recommendations`);
    } catch (error: any) {
      console.error('Error generating recommendations:', error);
      toast.error(error.message || 'Failed to generate recommendations');
    } finally {
      setLoading(false);
    }
  };

  const completeRecommendation = async (id: string) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      await supabase
        .from('smart_follow_up_recommendations')
        .update({
          is_completed: true,
          completed_at: new Date().toISOString(),
          completed_by: userData.user?.id
        })
        .eq('id', id);

      setRecommendations(prev => prev.filter(r => r.id !== id));
      toast.success('Follow-up marked complete');
    } catch (error) {
      toast.error('Failed to update recommendation');
    }
  };

  const dismissRecommendation = async (id: string) => {
    try {
      await supabase
        .from('smart_follow_up_recommendations')
        .update({ dismissed: true, dismissed_reason: 'User dismissed' })
        .eq('id', id);

      setRecommendations(prev => prev.filter(r => r.id !== id));
      toast.success('Recommendation dismissed');
    } catch (error) {
      toast.error('Failed to dismiss recommendation');
    }
  };

  const pendingCount = recommendations.filter(r => !r.is_completed).length;
  const urgentCount = recommendations.filter(r => 
    !r.is_completed && (r.priority === 'critical' || r.priority === 'high')
  ).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Smart Follow-Up Scheduler
              {urgentCount > 0 && (
                <Badge variant="destructive">{urgentCount} urgent</Badge>
              )}
            </CardTitle>
            <CardDescription>
              AI-powered follow-up recommendations based on claim activity and timeline
            </CardDescription>
          </div>
          <Button onClick={generateRecommendations} disabled={loading} size="sm">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Generate
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loadingData ? (
          <div className="text-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            <p className="text-muted-foreground">Loading recommendations...</p>
          </div>
        ) : recommendations.length === 0 ? (
          <div className="text-center py-8 border rounded-lg bg-muted/30">
            <Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">No pending follow-ups</p>
            <Button variant="outline" onClick={generateRecommendations} disabled={loading}>
              Analyze Claim for Follow-Ups
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {recommendations.map(rec => {
                const Icon = TYPE_ICONS[rec.recommendation_type] || Bell;
                const isOverdue = new Date(rec.recommended_date) < new Date();
                
                return (
                  <div
                    key={rec.id}
                    className={`p-4 border rounded-lg ${isOverdue ? 'border-destructive/50 bg-destructive/5' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-full ${PRIORITY_COLORS[rec.priority]}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs capitalize">
                            {rec.recommendation_type.replace('_', ' ')}
                          </Badge>
                          <Badge className={`text-xs ${PRIORITY_COLORS[rec.priority]}`}>
                            {rec.priority}
                          </Badge>
                          {rec.target_recipient && (
                            <span className="text-xs text-muted-foreground">
                              → {rec.target_recipient}
                            </span>
                          )}
                        </div>
                        <p className="text-sm">{rec.reason}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className={isOverdue ? 'text-destructive font-medium' : ''}>
                            {isOverdue ? 'Overdue: ' : 'Due: '}
                            {format(new Date(rec.recommended_date), 'MMM d, yyyy')}
                            {' '}({formatDistanceToNow(new Date(rec.recommended_date), { addSuffix: true })})
                          </span>
                          <span>
                            {Math.round(rec.ai_confidence * 100)}% confidence
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => completeRecommendation(rec.id)}
                          title="Mark complete"
                        >
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => dismissRecommendation(rec.id)}
                          title="Dismiss"
                        >
                          <X className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
