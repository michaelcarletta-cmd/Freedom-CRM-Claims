import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Scale, Save, RotateCcw, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface RubricWeight {
  id: string;
  category: string;
  indicator_key: string;
  indicator_label: string;
  weight: number;
  description: string | null;
  is_active: boolean;
}

interface EditedWeight {
  weight: number;
  is_active: boolean;
}

const CATEGORIES = [
  { value: 'directional', label: 'Directional Indicators', description: 'Evidence of directional force (supports peril)' },
  { value: 'collateral', label: 'Collateral Damage', description: 'Supporting damage evidence (supports peril)' },
  { value: 'pattern', label: 'Pattern/Dispersion', description: 'Damage distribution patterns (mixed)' },
  { value: 'competing_cause', label: 'Competing Causes', description: 'Alternative causation factors (opposes peril)' },
  { value: 'timeline', label: 'Timeline Factors', description: 'Temporal correlation indicators' },
  { value: 'roof_condition', label: 'Roof Condition', description: 'Pre-existing roof state factors' },
];

export const CausationRubricSettings = () => {
  const queryClient = useQueryClient();
  const [editedWeights, setEditedWeights] = useState<Record<string, EditedWeight>>({});
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newIndicator, setNewIndicator] = useState({
    category: '',
    indicator_key: '',
    indicator_label: '',
    weight: 0,
    description: '',
  });

  const { data: rubricWeights = [], isLoading } = useQuery({
    queryKey: ['causation-rubric-weights-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('causation_rubric_weights')
        .select('*')
        .order('category', { ascending: true })
        .order('weight', { ascending: false });
      
      if (error) throw error;
      return data as RubricWeight[];
    },
  });

  // Group by category
  const weightsByCategory = rubricWeights.reduce((acc, weight) => {
    if (!acc[weight.category]) acc[weight.category] = [];
    acc[weight.category].push(weight);
    return acc;
  }, {} as Record<string, RubricWeight[]>);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const updates = Object.entries(editedWeights).map(async ([id, changes]) => {
        const { error } = await supabase
          .from('causation_rubric_weights')
          .update({
            weight: changes.weight,
            is_active: changes.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
        
        if (error) throw error;
      });
      
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['causation-rubric-weights-admin'] });
      queryClient.invalidateQueries({ queryKey: ['causation-rubric-weights'] });
      setEditedWeights({});
      toast.success('Rubric weights saved successfully');
    },
    onError: (error) => {
      toast.error('Failed to save weights: ' + error.message);
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('causation_rubric_weights')
        .insert({
          category: newIndicator.category,
          indicator_key: newIndicator.indicator_key.toLowerCase().replace(/\s+/g, '_'),
          indicator_label: newIndicator.indicator_label,
          weight: newIndicator.weight,
          description: newIndicator.description || null,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['causation-rubric-weights-admin'] });
      queryClient.invalidateQueries({ queryKey: ['causation-rubric-weights'] });
      setShowAddDialog(false);
      setNewIndicator({
        category: '',
        indicator_key: '',
        indicator_label: '',
        weight: 0,
        description: '',
      });
      toast.success('Indicator added successfully');
    },
    onError: (error) => {
      toast.error('Failed to add indicator: ' + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('causation_rubric_weights')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['causation-rubric-weights-admin'] });
      queryClient.invalidateQueries({ queryKey: ['causation-rubric-weights'] });
      toast.success('Indicator deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete: ' + error.message);
    },
  });

  const handleWeightChange = (id: string, weight: number) => {
    const original = rubricWeights.find(w => w.id === id);
    if (!original) return;
    
    setEditedWeights(prev => ({
      ...prev,
      [id]: {
        weight,
        is_active: prev[id]?.is_active ?? original.is_active,
      },
    }));
  };

  const handleActiveChange = (id: string, is_active: boolean) => {
    const original = rubricWeights.find(w => w.id === id);
    if (!original) return;
    
    setEditedWeights(prev => ({
      ...prev,
      [id]: {
        weight: prev[id]?.weight ?? original.weight,
        is_active,
      },
    }));
  };

  const getEffectiveValue = (weight: RubricWeight) => {
    if (editedWeights[weight.id]) {
      return editedWeights[weight.id];
    }
    return { weight: weight.weight, is_active: weight.is_active };
  };

  const hasChanges = Object.keys(editedWeights).length > 0;

  const handleReset = () => {
    setEditedWeights({});
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-primary/10 text-primary">
                <Scale className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Causation Rubric Editor</CardTitle>
                <CardDescription>
                  Configure scoring weights for the But-For Causation Test
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Indicator
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Indicator</DialogTitle>
                    <DialogDescription>
                      Create a new scoring indicator for the causation test
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select 
                        value={newIndicator.category} 
                        onValueChange={v => setNewIndicator(prev => ({ ...prev, category: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Indicator Label</Label>
                      <Input 
                        placeholder="e.g., Fascia board damage"
                        value={newIndicator.indicator_label}
                        onChange={e => setNewIndicator(prev => ({ 
                          ...prev, 
                          indicator_label: e.target.value,
                          indicator_key: e.target.value.toLowerCase().replace(/\s+/g, '_'),
                        }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Weight (-50 to +50)</Label>
                      <Input 
                        type="number"
                        min={-50}
                        max={50}
                        value={newIndicator.weight}
                        onChange={e => setNewIndicator(prev => ({ ...prev, weight: parseInt(e.target.value) || 0 }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        Positive = supports peril causation, Negative = supports alternative causation
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Description (optional)</Label>
                      <Textarea 
                        placeholder="Brief explanation of this indicator..."
                        value={newIndicator.description}
                        onChange={e => setNewIndicator(prev => ({ ...prev, description: e.target.value }))}
                      />
                    </div>
                    <Button 
                      onClick={() => addMutation.mutate()} 
                      disabled={!newIndicator.category || !newIndicator.indicator_label || addMutation.isPending}
                      className="w-full"
                    >
                      {addMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      Add Indicator
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              
              {hasChanges && (
                <>
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                  <Button size="sm" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Changes
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Scoring Thresholds Info */}
          <div className="p-4 bg-muted/30 rounded-lg mb-6">
            <p className="font-medium text-sm mb-2">Decision Thresholds</p>
            <div className="grid gap-2 md:grid-cols-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-500">≥20</Badge>
                <span>Causation Supported</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-yellow-500">-9 to 19</Badge>
                <span>Indeterminate</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-red-500">≤-10</Badge>
                <span>Causation Not Supported</span>
              </div>
            </div>
          </div>

          <Accordion type="multiple" defaultValue={CATEGORIES.map(c => c.value)} className="space-y-2">
            {CATEGORIES.map(category => (
              <AccordionItem key={category.value} value={category.value} className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{category.label}</span>
                    <Badge variant="outline" className="text-xs">
                      {weightsByCategory[category.value]?.length || 0} indicators
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm text-muted-foreground mb-4">{category.description}</p>
                  
                  <div className="space-y-3">
                    {weightsByCategory[category.value]?.map(weight => {
                      const effective = getEffectiveValue(weight);
                      const isModified = editedWeights[weight.id] !== undefined;
                      
                      return (
                        <div 
                          key={weight.id} 
                          className={cn(
                            "p-3 rounded-lg border flex flex-wrap items-center gap-4",
                            isModified && "border-primary bg-primary/5",
                            !effective.is_active && "opacity-50"
                          )}
                        >
                          <div className="flex-1 min-w-[200px]">
                            <p className="font-medium text-sm">{weight.indicator_label}</p>
                            {weight.description && (
                              <p className="text-xs text-muted-foreground">{weight.description}</p>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Label htmlFor={`weight-${weight.id}`} className="text-xs text-muted-foreground">
                                Weight
                              </Label>
                              <Input 
                                id={`weight-${weight.id}`}
                                type="number"
                                min={-50}
                                max={50}
                                className={cn(
                                  "w-20 h-8 text-center",
                                  effective.weight > 0 && "text-green-600",
                                  effective.weight < 0 && "text-red-600"
                                )}
                                value={effective.weight}
                                onChange={e => handleWeightChange(weight.id, parseInt(e.target.value) || 0)}
                              />
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Label htmlFor={`active-${weight.id}`} className="text-xs text-muted-foreground">
                                Active
                              </Label>
                              <Switch 
                                id={`active-${weight.id}`}
                                checked={effective.is_active}
                                onCheckedChange={checked => handleActiveChange(weight.id, checked)}
                              />
                            </div>
                            
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm('Delete this indicator?')) {
                                  deleteMutation.mutate(weight.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    
                    {(!weightsByCategory[category.value] || weightsByCategory[category.value].length === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No indicators in this category
                      </p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
};

export default CausationRubricSettings;
