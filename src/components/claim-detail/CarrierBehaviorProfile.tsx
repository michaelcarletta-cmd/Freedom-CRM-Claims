import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { 
  Building2, 
  Clock, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Target,
  ArrowRight,
  Loader2,
  BarChart3
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CarrierBehaviorProfileProps {
  carrierName?: string;
  compact?: boolean;
}

interface CarrierProfile {
  id: string;
  carrier_name: string;
  avg_initial_response_days: number | null;
  avg_supplement_response_days: number | null;
  supplement_approval_rate: number | null;
  first_offer_vs_final_ratio: number | null;
  total_claims_tracked: number | null;
  typical_denial_reasons: any[] | null;
  common_lowball_tactics: any[] | null;
  recommended_approach: string | null;
  counter_sequences: any[] | null;
}

interface Playbook {
  id: string;
  trigger_condition: any;
  recommended_action: string;
  action_type: string;
  success_rate: number | null;
  priority: number;
}

export const CarrierBehaviorProfile = ({ carrierName, compact = false }: CarrierBehaviorProfileProps) => {
  const [profile, setProfile] = useState<CarrierProfile | null>(null);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (carrierName) {
      loadCarrierData();
    }
  }, [carrierName]);

  const loadCarrierData = async () => {
    if (!carrierName) return;
    
    setLoading(true);
    try {
      // Load carrier behavior profile
      const { data: profileData } = await supabase
        .from('carrier_behavior_profiles')
        .select('*')
        .ilike('carrier_name', `%${carrierName}%`)
        .limit(1)
        .single();

      if (profileData) {
        setProfile(profileData as unknown as CarrierProfile);
      }

      // Load playbooks for this carrier
      const { data: playbookData } = await supabase
        .from('carrier_playbooks')
        .select('*')
        .ilike('carrier_name', `%${carrierName}%`)
        .eq('is_active', true)
        .order('priority', { ascending: true });

      if (playbookData) {
        setPlaybooks(playbookData as unknown as Playbook[]);
      }
    } catch (error) {
      console.error("Error loading carrier data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return compact ? null : (
      <div className="text-center text-muted-foreground text-sm p-4">
        <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
        Loading carrier intelligence...
      </div>
    );
  }

  if (!profile && playbooks.length === 0) {
    if (compact) {
      return (
        <div className="text-xs text-muted-foreground">
          <Building2 className="h-4 w-4 inline mr-1" />
          No carrier profile for {carrierName || 'Unknown'}
        </div>
      );
    }
    return null;
  }

  if (compact) {
    return (
      <div className="space-y-2">
        <h4 className="text-xs font-semibold flex items-center gap-1">
          <Building2 className="h-3 w-3 text-orange-600" />
          Carrier: {carrierName}
        </h4>
        
        {profile && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            {profile.avg_initial_response_days && (
              <div className="p-2 bg-muted/50 rounded">
                <div className="text-muted-foreground">Avg Response</div>
                <div className="font-medium">{profile.avg_initial_response_days} days</div>
              </div>
            )}
            {profile.supplement_approval_rate && (
              <div className="p-2 bg-muted/50 rounded">
                <div className="text-muted-foreground">Supp. Approval</div>
                <div className="font-medium">{profile.supplement_approval_rate}%</div>
              </div>
            )}
          </div>
        )}

        {playbooks.length > 0 && (
          <div className="text-xs p-2 bg-orange-50 dark:bg-orange-950/30 rounded border border-orange-200 dark:border-orange-800">
            <div className="font-medium text-orange-700 dark:text-orange-300 mb-1">Playbook Tip:</div>
            <div className="text-orange-600 dark:text-orange-400">{playbooks[0].recommended_action.substring(0, 100)}...</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          Carrier Intelligence: {carrierName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Metrics Grid */}
        {profile && (
          <div className="grid grid-cols-4 gap-3">
            <MetricCard 
              label="Avg Response" 
              value={profile.avg_initial_response_days ? `${profile.avg_initial_response_days}d` : '--'} 
              icon={<Clock className="h-4 w-4" />}
            />
            <MetricCard 
              label="Supp. Response" 
              value={profile.avg_supplement_response_days ? `${profile.avg_supplement_response_days}d` : '--'} 
              icon={<Clock className="h-4 w-4" />}
            />
            <MetricCard 
              label="Supp. Approval" 
              value={profile.supplement_approval_rate ? `${profile.supplement_approval_rate}%` : '--'} 
              icon={<CheckCircle2 className="h-4 w-4" />}
              positive={profile.supplement_approval_rate ? profile.supplement_approval_rate >= 50 : undefined}
            />
            <MetricCard 
              label="1st vs Final" 
              value={profile.first_offer_vs_final_ratio ? `${(profile.first_offer_vs_final_ratio * 100).toFixed(0)}%` : '--'} 
              icon={<TrendingUp className="h-4 w-4" />}
            />
          </div>
        )}

        {/* Recommended Approach */}
        {profile?.recommended_approach && (
          <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
            <div className="text-xs font-semibold mb-1 text-primary">Recommended Approach</div>
            <p className="text-sm">{profile.recommended_approach}</p>
          </div>
        )}

        {/* Playbooks */}
        {playbooks.length > 0 && (
          <div>
            <div className="text-xs font-semibold mb-2 flex items-center gap-1">
              <Target className="h-3 w-3" />
              Tactical Playbook
            </div>
            <ScrollArea className="max-h-48">
              <div className="space-y-2">
                {playbooks.map(playbook => (
                  <div key={playbook.id} className="p-2 bg-muted/50 rounded-lg text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">{playbook.action_type}</Badge>
                      {playbook.success_rate && (
                        <span className="text-green-600">{playbook.success_rate}% success</span>
                      )}
                    </div>
                    <p className="text-muted-foreground">{playbook.recommended_action}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Common Denial Reasons */}
        {profile?.typical_denial_reasons && Array.isArray(profile.typical_denial_reasons) && profile.typical_denial_reasons.length > 0 && (
          <div>
            <div className="text-xs font-semibold mb-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-orange-600" />
              Common Denial Patterns
            </div>
            <div className="flex flex-wrap gap-1">
              {profile.typical_denial_reasons.slice(0, 5).map((reason: any, i: number) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {typeof reason === 'string' ? reason : reason.reason || reason.type}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const MetricCard = ({ 
  label, 
  value, 
  icon, 
  positive 
}: { 
  label: string; 
  value: string; 
  icon: React.ReactNode;
  positive?: boolean;
}) => (
  <div className="p-2 bg-muted/50 rounded-lg text-center">
    <div className={cn(
      "text-lg font-bold",
      positive === true && "text-green-600",
      positive === false && "text-red-600"
    )}>
      {value}
    </div>
    <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
      {icon}
      {label}
    </div>
  </div>
);
