import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Calendar, User, ExternalLink } from "lucide-react";
import { format, isPast } from "date-fns";
import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  priority: string;
  claim_id: string;
  claim_number: string;
  assignee_name: string | null;
  created_at: string;
}

const Tasks = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchTasks();

    // Subscribe to task changes
    const channel = supabase
      .channel('all-tasks')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
        },
        () => {
          fetchTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchTasks = async () => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          *,
          claims!inner(claim_number),
          profiles:assigned_to(full_name)
        `)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (error) throw error;

      const tasksWithDetails = data?.map((task: any) => ({
        ...task,
        claim_number: task.claims.claim_number,
        assignee_name: task.profiles?.full_name || null,
      })) || [];

      setTasks(tasksWithDetails);
    } catch (error: any) {
      console.error("Error fetching tasks:", error);
      toast({
        title: "Error",
        description: "Failed to load tasks",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleComplete = async (taskId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === "completed" ? "pending" : "completed";
      const { error } = await supabase
        .from("tasks")
        .update({
          status: newStatus,
          completed_at: newStatus === "completed" ? new Date().toISOString() : null,
        })
        .eq("id", taskId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Task marked as ${newStatus}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update task",
        variant: "destructive",
      });
    }
  };

  const pendingTasks = tasks.filter((task) => task.status !== "completed");
  const completedTasks = tasks.filter((task) => task.status === "completed");

  const TaskList = ({ taskList }: { taskList: Task[] }) => (
    <div className="space-y-3">
      {taskList.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No tasks found
        </div>
      ) : (
        taskList.map((task) => {
          const isOverdue = task.due_date && isPast(new Date(task.due_date)) && task.status !== "completed";
          const priorityColors = {
            high: "destructive",
            medium: "default",
            low: "secondary",
          };

          return (
            <Card
              key={task.id}
              className={`p-4 ${task.status === "completed" ? "opacity-60" : ""} ${
                isOverdue ? "border-red-500" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={task.status === "completed"}
                  onCheckedChange={() => handleToggleComplete(task.id, task.status)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3
                        className={`font-medium text-foreground ${
                          task.status === "completed" ? "line-through" : ""
                        }`}
                      >
                        {task.title}
                      </h3>
                      {task.description && (
                        <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                      )}
                    </div>
                    <Link to={`/claims/${task.claim_id}`}>
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
                    <Badge variant="outline">{task.claim_number}</Badge>
                    <Badge variant={priorityColors[task.priority as keyof typeof priorityColors] as "default" | "destructive" | "outline" | "secondary"}>
                      {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} Priority
                    </Badge>
                    {task.due_date && (
                      <div
                        className={`flex items-center gap-1 text-muted-foreground ${
                          isOverdue ? "text-red-600 dark:text-red-400 font-semibold" : ""
                        }`}
                      >
                        <Calendar className="h-4 w-4" />
                        <span>
                          {isOverdue && "Overdue: "}
                          {format(new Date(task.due_date), "MMM d, yyyy")}
                        </span>
                      </div>
                    )}
                    {task.assignee_name && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <User className="h-4 w-4" />
                        <span>{task.assignee_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tasks</h1>
          <p className="text-muted-foreground mt-1">Loading tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Tasks</h1>
        <p className="text-muted-foreground mt-1">Manage all your tasks across claims</p>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList>
          <TabsTrigger value="pending">
            Pending ({pendingTasks.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({completedTasks.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          <TaskList taskList={pendingTasks} />
        </TabsContent>

        <TabsContent value="completed" className="mt-6">
          <TaskList taskList={completedTasks} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Tasks;
