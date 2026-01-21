import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Sparkles, Loader2, RefreshCw, Check, X, Plus, 
  Calendar, Flag, User, Lightbulb 
} from "lucide-react";
import { format, addDays } from "date-fns";

interface DarwinTaskGeneratorProps {
  claimId: string;
  claim: any;
}

interface AIGeneratedTask {
  id: string;
  suggested_title: string;
  suggested_description: string | null;
  suggested_due_date: string | null;
  suggested_priority: string;
  generation_reason: string;
  source_analysis_type: string | null;
  is_approved: boolean;
  is_dismissed: boolean;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-destructive border-destructive',
  medium: 'text-yellow-600 border-yellow-600',
  low: 'text-muted-foreground border-muted-foreground'
};

export const DarwinTaskGenerator = ({ claimId, claim }: DarwinTaskGeneratorProps) => {
  const [suggestedTasks, setSuggestedTasks] = useState<AIGeneratedTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [creatingTask, setCreatingTask] = useState<string | null>(null);

  useEffect(() => {
    loadSuggestedTasks();
  }, [claimId]);

  const loadSuggestedTasks = async () => {
    setLoadingData(true);
    try {
      const { data, error } = await supabase
        .from('ai_generated_tasks')
        .select('*')
        .eq('claim_id', claimId)
        .eq('is_approved', false)
        .eq('is_dismissed', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSuggestedTasks(data || []);
    } catch (error) {
      console.error('Error loading suggested tasks:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const generateTaskSuggestions = async () => {
    setLoading(true);
    toast.info('Analyzing claim to generate task suggestions...');

    try {
      const { data, error } = await supabase.functions.invoke('darwin-ai-analysis', {
        body: {
          claimId,
          analysisType: 'task_generation'
        }
      });

      if (error) throw error;

      const aiTasks = data.tasks || [];
      
      for (const task of aiTasks) {
        await supabase.from('ai_generated_tasks').insert({
          claim_id: claimId,
          suggested_title: task.title,
          suggested_description: task.description,
          suggested_due_date: task.due_date || addDays(new Date(), 3).toISOString().split('T')[0],
          suggested_priority: task.priority || 'medium',
          generation_reason: task.reason,
          source_analysis_type: 'task_generation'
        });
      }

      await loadSuggestedTasks();
      toast.success(`Generated ${aiTasks.length} task suggestions`);
    } catch (error: any) {
      console.error('Error generating tasks:', error);
      toast.error(error.message || 'Failed to generate task suggestions');
    } finally {
      setLoading(false);
    }
  };

  const approveAndCreateTask = async (suggestedTask: AIGeneratedTask) => {
    setCreatingTask(suggestedTask.id);
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      // Create the actual task
      const { data: newTask, error: taskError } = await supabase
        .from('tasks')
        .insert({
          claim_id: claimId,
          title: suggestedTask.suggested_title,
          description: suggestedTask.suggested_description,
          due_date: suggestedTask.suggested_due_date,
          priority: suggestedTask.suggested_priority,
          status: 'pending',
          created_by: userData.user?.id
        })
        .select()
        .single();

      if (taskError) throw taskError;

      // Mark AI suggestion as approved
      await supabase
        .from('ai_generated_tasks')
        .update({
          is_approved: true,
          approved_by: userData.user?.id,
          approved_at: new Date().toISOString(),
          task_id: newTask.id
        })
        .eq('id', suggestedTask.id);

      setSuggestedTasks(prev => prev.filter(t => t.id !== suggestedTask.id));
      toast.success('Task created successfully');
    } catch (error: any) {
      console.error('Error creating task:', error);
      toast.error(error.message || 'Failed to create task');
    } finally {
      setCreatingTask(null);
    }
  };

  const dismissSuggestion = async (id: string) => {
    try {
      await supabase
        .from('ai_generated_tasks')
        .update({ is_dismissed: true, dismissed_reason: 'User dismissed' })
        .eq('id', id);

      setSuggestedTasks(prev => prev.filter(t => t.id !== id));
      toast.success('Suggestion dismissed');
    } catch (error) {
      toast.error('Failed to dismiss suggestion');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Task Generator
              {suggestedTasks.length > 0 && (
                <Badge variant="secondary">{suggestedTasks.length} pending</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Darwin analyzes your claim and suggests tasks based on status, deadlines, and best practices
            </CardDescription>
          </div>
          <Button onClick={generateTaskSuggestions} disabled={loading} size="sm">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Generate Tasks
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loadingData ? (
          <div className="text-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            <p className="text-muted-foreground">Loading suggestions...</p>
          </div>
        ) : suggestedTasks.length === 0 ? (
          <div className="text-center py-8 border rounded-lg bg-muted/30">
            <Lightbulb className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">No pending task suggestions</p>
            <Button variant="outline" onClick={generateTaskSuggestions} disabled={loading}>
              Generate Task Suggestions
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {suggestedTasks.map(task => (
                <div
                  key={task.id}
                  className="p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm">{task.suggested_title}</h4>
                        <Badge 
                          variant="outline" 
                          className={`text-xs capitalize ${PRIORITY_COLORS[task.suggested_priority]}`}
                        >
                          <Flag className="h-3 w-3 mr-1" />
                          {task.suggested_priority}
                        </Badge>
                      </div>
                      {task.suggested_description && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {task.suggested_description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {task.suggested_due_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Due: {format(new Date(task.suggested_due_date), 'MMM d, yyyy')}
                          </span>
                        )}
                        <span className="italic">
                          Why: {task.generation_reason}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => approveAndCreateTask(task)}
                        disabled={creatingTask === task.id}
                      >
                        {creatingTask === task.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-1" />
                            Create
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => dismissSuggestion(task.id)}
                        title="Dismiss"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
