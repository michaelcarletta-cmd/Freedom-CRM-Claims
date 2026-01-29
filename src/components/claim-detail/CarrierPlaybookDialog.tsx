import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { 
  BookOpen, 
  Target, 
  AlertTriangle, 
  TrendingUp,
  Clock,
  CheckCircle2,
  ArrowRight,
  Loader2,
  Building2,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CarrierPlaybookDialogProps {
  carrierName?: string;
  stateCode?: string;
  trigger?: React.ReactNode;
}

interface Playbook {
  id: string;
  carrier_name: string;
  trigger_condition: any;
  recommended_action: string;
  action_type: string;
  success_rate: number | null;
  sample_size: number | null;
  priority: number;
}

interface CarrierProfile {
  carrier_name: string;
  avg_initial_response_days: number | null;
  avg_supplement_response_days: number | null;
  supplement_approval_rate: number | null;
  first_offer_vs_final_ratio: number | null;
  total_claims_tracked: number | null;
  typical_denial_reasons: any[];
  common_lowball_tactics: any[];
  recommended_approach: string | null;
}

export const CarrierPlaybookDialog = ({ carrierName, stateCode, trigger }: CarrierPlaybookDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [profile, setProfile] = useState<CarrierProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string>('all');

  useEffect(() => {
    if (isOpen && carrierName) {
      loadData();
    }
  }, [isOpen, carrierName]);

  const loadData = async () => {
    if (!carrierName) return;
    
    setLoading(true);
    try {
      // Load playbooks
      let query = supabase
        .from('carrier_playbooks')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: true });

      // Try exact match first, then partial
      const { data: exactMatch } = await query.eq('carrier_name', carrierName);
      
      if (exactMatch && exactMatch.length > 0) {
        setPlaybooks(exactMatch as unknown as Playbook[]);
      } else {
        const { data: partialMatch } = await supabase
          .from('carrier_playbooks')
          .select('*')
          .ilike('carrier_name', `%${carrierName.split(' ')[0]}%`)
          .eq('is_active', true)
          .order('priority', { ascending: true });
        
        setPlaybooks((partialMatch || []) as unknown as Playbook[]);
      }

      // Load profile
      const { data: profileData } = await supabase
        .from('carrier_behavior_profiles')
        .select('*')
        .ilike('carrier_name', `%${carrierName}%`)
        .limit(1)
        .single();

      if (profileData) {
        setProfile(profileData as unknown as CarrierProfile);
      }
    } catch (error) {
      console.error("Error loading playbook data:", error);
    } finally {
      setLoading(false);
    }
  };

  const actionTypes = ['all', ...new Set(playbooks.map(p => p.action_type))];
  const filteredPlaybooks = selectedType === 'all' 
    ? playbooks 
    : playbooks.filter(p => p.action_type === selectedType);

  const getActionTypeIcon = (type: string) => {
    switch (type) {
      case 'escalation': return <AlertTriangle className="h-4 w-4" />;
      case 'negotiation': return <TrendingUp className="h-4 w-4" />;
      case 'supplement': return <Target className="h-4 w-4" />;
      case 'rebuttal': return <Zap className="h-4 w-4" />;
      case 'communication': return <Clock className="h-4 w-4" />;
      default: return <BookOpen className="h-4 w-4" />;
    }
  };

  const getActionTypeColor = (type: string) => {
    switch (type) {
      case 'escalation': return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200';
      case 'negotiation': return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200';
      case 'supplement': return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200';
      case 'rebuttal': return 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200';
      case 'communication': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Carrier Playbook
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {carrierName || 'Carrier'} Playbook
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-6 p-1">
              {/* Carrier Overview */}
              {profile && (
                <Card className="bg-gradient-to-r from-primary/5 to-transparent">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Carrier Profile</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground text-xs">Avg Response</div>
                        <div className="font-bold">{profile.avg_initial_response_days ?? '--'} days</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Supp. Response</div>
                        <div className="font-bold">{profile.avg_supplement_response_days ?? '--'} days</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Supp. Approval</div>
                        <div className="font-bold">{profile.supplement_approval_rate ?? '--'}%</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Claims Tracked</div>
                        <div className="font-bold">{profile.total_claims_tracked ?? '--'}</div>
                      </div>
                    </div>

                    {profile.recommended_approach && (
                      <div className="mt-4 p-3 bg-primary/10 rounded-lg">
                        <div className="text-xs font-semibold text-primary mb-1">Recommended Approach</div>
                        <p className="text-sm">{profile.recommended_approach}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Playbook Tactics */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Tactical Playbook
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {actionTypes.map(type => (
                      <Badge
                        key={type}
                        variant={selectedType === type ? 'default' : 'outline'}
                        className="cursor-pointer capitalize"
                        onClick={() => setSelectedType(type)}
                      >
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>

                {filteredPlaybooks.length > 0 ? (
                  <div className="space-y-3">
                    {filteredPlaybooks.map(playbook => (
                      <Card key={playbook.id} className="border-l-4 border-l-primary">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={cn("p-2 rounded-lg", getActionTypeColor(playbook.action_type))}>
                              {getActionTypeIcon(playbook.action_type)}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="capitalize text-xs">
                                  {playbook.action_type}
                                </Badge>
                                {playbook.success_rate && (
                                  <Badge className="bg-green-500 text-xs">
                                    {playbook.success_rate}% success
                                  </Badge>
                                )}
                                {playbook.sample_size && playbook.sample_size > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    ({playbook.sample_size} claims)
                                  </span>
                                )}
                              </div>
                              <p className="text-sm">{playbook.recommended_action}</p>
                              
                              {/* Show trigger condition in human-readable form */}
                              {playbook.trigger_condition && (
                                <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                                  <ArrowRight className="h-3 w-3" />
                                  When: {formatTriggerCondition(playbook.trigger_condition)}
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No playbook tactics found for this carrier</p>
                  </div>
                )}
              </div>

              {/* Common Denial Patterns */}
              {profile?.typical_denial_reasons && Array.isArray(profile.typical_denial_reasons) && profile.typical_denial_reasons.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-600" />
                      Common Denial Patterns
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {profile.typical_denial_reasons.map((reason: any, i: number) => (
                        <Badge key={i} variant="secondary">
                          {typeof reason === 'string' ? reason : reason.reason || reason.type}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};

// Helper to format trigger conditions for display
function formatTriggerCondition(condition: any): string {
  if (!condition || typeof condition !== 'object') return 'General';
  
  const parts: string[] = [];
  
  if (condition.delay_days?.gte) {
    parts.push(`delay ≥ ${condition.delay_days.gte} days`);
  }
  if (condition.supplement_pending) {
    parts.push('supplement pending');
  }
  if (condition.days_waiting?.gte) {
    parts.push(`waiting ≥ ${condition.days_waiting.gte} days`);
  }
  if (condition.lowball_estimate) {
    parts.push('lowball estimate received');
  }
  if (condition.engineer_report_received) {
    parts.push('engineer report received');
  }
  if (condition.first_denial) {
    parts.push('first denial received');
  }
  if (condition.supplement_count?.gte) {
    parts.push(`${condition.supplement_count.gte}+ supplements submitted`);
  }
  if (condition.communication_gap_days?.gte) {
    parts.push(`no contact for ${condition.communication_gap_days.gte}+ days`);
  }

  return parts.length > 0 ? parts.join(', ') : 'General';
}
