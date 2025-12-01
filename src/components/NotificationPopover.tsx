import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isTomorrow, isPast } from "date-fns";
import { useNavigate } from "react-router-dom";

interface Task {
  id: string;
  title: string;
  due_date: string | null;
  priority: string | null;
  status: string;
  claim_id: string;
  claims: {
    claim_number: string;
  };
}

export function NotificationPopover() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    fetchTasks();

    const channel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks'
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
    const { data } = await supabase
      .from("tasks")
      .select(`
        id,
        title,
        due_date,
        priority,
        status,
        claim_id,
        claims (
          claim_number
        )
      `)
      .neq("status", "completed")
      .order("due_date", { ascending: true });

    if (data) {
      const relevantTasks = data.filter((task) => {
        if (!task.due_date) return false;
        const dueDate = new Date(task.due_date);
        return isPast(dueDate) || isToday(dueDate) || isTomorrow(dueDate);
      });
      
      setTasks(relevantTasks);
      setUnreadCount(relevantTasks.length);
    }
  };

  const getTaskBadgeVariant = (task: Task) => {
    if (!task.due_date) return "secondary";
    const dueDate = new Date(task.due_date);
    if (isPast(dueDate) && !isToday(dueDate)) return "destructive";
    if (isToday(dueDate)) return "default";
    return "secondary";
  };

  const getTaskBadgeText = (task: Task) => {
    if (!task.due_date) return "";
    const dueDate = new Date(task.due_date);
    if (isPast(dueDate) && !isToday(dueDate)) return "Overdue";
    if (isToday(dueDate)) return "Due Today";
    if (isTomorrow(dueDate)) return "Due Tomorrow";
    return "";
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Notifications</h3>
          <p className="text-sm text-muted-foreground">
            {unreadCount} pending {unreadCount === 1 ? "task" : "tasks"}
          </p>
        </div>
        <ScrollArea className="h-[400px]">
          {tasks.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No pending notifications
            </div>
          ) : (
            <div className="divide-y">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/claims/${task.claim_id}?tab=tasks`)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="font-medium text-sm">{task.title}</h4>
                    <Badge variant={getTaskBadgeVariant(task)} className="text-xs shrink-0">
                      {getTaskBadgeText(task)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Claim: {task.claims?.claim_number}
                  </p>
                  {task.due_date && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Due: {format(new Date(task.due_date), "MMM d, yyyy")}
                    </p>
                  )}
                  {task.priority && (
                    <Badge variant="outline" className="mt-2 text-xs">
                      {task.priority}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
