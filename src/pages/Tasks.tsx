import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

const mockTasks = [
  { id: "1", title: "Follow up with John Smith", claim: "CLM-2024-001", priority: "high", completed: false },
  { id: "2", title: "Review inspection report", claim: "CLM-2024-002", priority: "medium", completed: false },
  { id: "3", title: "Schedule property visit", claim: "CLM-2024-003", priority: "high", completed: false },
  { id: "4", title: "Submit documentation", claim: "CLM-2024-004", priority: "low", completed: true },
];

const Tasks = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Tasks</h1>
        <p className="text-muted-foreground mt-1">Your pending tasks and follow-ups</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                <Checkbox checked={task.completed} />
                <div className="flex-1">
                  <h3 className={`font-medium ${task.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {task.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">Claim: {task.claim}</p>
                </div>
                <Badge variant={task.priority === "high" ? "destructive" : task.priority === "medium" ? "default" : "secondary"}>
                  {task.priority}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Tasks;
