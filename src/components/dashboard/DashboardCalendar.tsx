import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { 
  CalendarDays, 
  ChevronLeft, 
  ChevronRight, 
  ListTodo, 
  Camera,
  Clock
} from "lucide-react";
import { 
  format, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay,
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  isToday,
  isBefore
} from "date-fns";
import { parseLocalDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

type ViewMode = "day" | "week" | "month";

interface AgendaItem {
  id: string;
  title: string;
  date: Date;
  time?: string;
  type: "task" | "inspection";
  claimId: string;
  claimNumber?: string;
  policyholderName?: string;
  status?: string;
  isOverdue?: boolean;
}

export function DashboardCalendar() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());

  // Fetch tasks
  const { data: tasks } = useQuery({
    queryKey: ["calendar-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, claims(id, claim_number, policyholder_name)")
        .not("due_date", "is", null)
        .order("due_date", { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch inspections
  const { data: inspections } = useQuery({
    queryKey: ["calendar-inspections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("*, claims:claim_id(id, claim_number, policyholder_name)")
        .order("inspection_date", { ascending: true });
      
      if (error) throw error;
      return data;
    },
  });

  // Combine and process agenda items
  const agendaItems = useMemo(() => {
    const items: AgendaItem[] = [];
    const now = new Date();

    // Add tasks
    tasks?.forEach((task: any) => {
      if (task.due_date) {
        const dueDate = parseLocalDate(task.due_date);
        items.push({
          id: `task-${task.id}`,
          title: task.title,
          date: dueDate,
          type: "task",
          claimId: task.claim_id,
          claimNumber: task.claims?.claim_number,
          policyholderName: task.claims?.policyholder_name,
          status: task.status,
          isOverdue: task.status === "pending" && isBefore(dueDate, now),
        });
      }
    });

    // Add inspections
    inspections?.forEach((insp: any) => {
      const inspDate = parseLocalDate(insp.inspection_date);
      items.push({
        id: `insp-${insp.id}`,
        title: `${insp.inspection_type || "Inspection"}`,
        date: inspDate,
        time: insp.inspection_time,
        type: "inspection",
        claimId: insp.claim_id,
        claimNumber: insp.claims?.claim_number,
        policyholderName: insp.claims?.policyholder_name,
        status: insp.status,
        isOverdue: insp.status === "scheduled" && isBefore(inspDate, now),
      });
    });

    return items.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [tasks, inspections]);

  // Get date range based on view mode
  const dateRange = useMemo(() => {
    switch (viewMode) {
      case "day":
        return { start: currentDate, end: currentDate };
      case "week":
        return { 
          start: startOfWeek(currentDate, { weekStartsOn: 0 }), 
          end: endOfWeek(currentDate, { weekStartsOn: 0 }) 
        };
      case "month":
        return { 
          start: startOfMonth(currentDate), 
          end: endOfMonth(currentDate) 
        };
    }
  }, [viewMode, currentDate]);

  // Filter items for current view
  const filteredItems = useMemo(() => {
    return agendaItems.filter(item => {
      const itemDate = item.date;
      return itemDate >= dateRange.start && itemDate <= dateRange.end;
    });
  }, [agendaItems, dateRange]);

  // Get days for the view
  const viewDays = useMemo(() => {
    return eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
  }, [dateRange]);

  // Group items by day
  const itemsByDay = useMemo(() => {
    const grouped: Record<string, AgendaItem[]> = {};
    filteredItems.forEach(item => {
      const key = format(item.date, "yyyy-MM-dd");
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });
    return grouped;
  }, [filteredItems]);

  // Navigation functions
  const goToPrevious = () => {
    switch (viewMode) {
      case "day":
        setCurrentDate(subDays(currentDate, 1));
        break;
      case "week":
        setCurrentDate(subWeeks(currentDate, 1));
        break;
      case "month":
        setCurrentDate(subMonths(currentDate, 1));
        break;
    }
  };

  const goToNext = () => {
    switch (viewMode) {
      case "day":
        setCurrentDate(addDays(currentDate, 1));
        break;
      case "week":
        setCurrentDate(addWeeks(currentDate, 1));
        break;
      case "month":
        setCurrentDate(addMonths(currentDate, 1));
        break;
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Format header based on view
  const headerText = useMemo(() => {
    switch (viewMode) {
      case "day":
        return format(currentDate, "EEEE, MMMM d, yyyy");
      case "week":
        return `${format(dateRange.start, "MMM d")} - ${format(dateRange.end, "MMM d, yyyy")}`;
      case "month":
        return format(currentDate, "MMMM yyyy");
    }
  }, [viewMode, currentDate, dateRange]);

  const handleItemClick = (item: AgendaItem) => {
    navigate(`/claims/${item.claimId}`);
  };

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Calendar
          </CardTitle>
          
          <div className="flex items-center gap-2">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <TabsList className="h-8">
                <TabsTrigger value="day" className="text-xs px-2">Day</TabsTrigger>
                <TabsTrigger value="week" className="text-xs px-2">Week</TabsTrigger>
                <TabsTrigger value="month" className="text-xs px-2">Month</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToPrevious}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={goToToday}>
              Today
            </Button>
          </div>
          <span className="text-sm font-medium">{headerText}</span>
        </div>
      </CardHeader>

      <CardContent>
        {viewMode === "month" ? (
          // Month view - use calendar with event dots
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-shrink-0">
              <Calendar
                mode="single"
                selected={currentDate}
                onSelect={(date) => date && setCurrentDate(date)}
                month={currentDate}
                onMonthChange={setCurrentDate}
                className="rounded-md border pointer-events-auto"
                modifiers={{
                  hasEvents: (date) => {
                    const key = format(date, "yyyy-MM-dd");
                    return !!itemsByDay[key]?.length;
                  },
                }}
                modifiersStyles={{
                  hasEvents: {
                    fontWeight: "bold",
                    textDecoration: "underline",
                    textUnderlineOffset: "4px",
                  },
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium mb-2">
                Events for {format(currentDate, "MMMM d, yyyy")}
              </h4>
              <AgendaList 
                items={itemsByDay[format(currentDate, "yyyy-MM-dd")] || []} 
                onItemClick={handleItemClick}
              />
            </div>
          </div>
        ) : viewMode === "week" ? (
          // Week view - show all days with their events
          <div className="space-y-3">
            {viewDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayItems = itemsByDay[key] || [];
              const dayIsToday = isToday(day);
              
              return (
                <div 
                  key={key} 
                  className={cn(
                    "border rounded-lg p-3",
                    dayIsToday && "border-primary bg-primary/5"
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn(
                      "text-sm font-medium",
                      dayIsToday && "text-primary"
                    )}>
                      {format(day, "EEEE, MMM d")}
                    </span>
                    {dayIsToday && (
                      <Badge variant="secondary" className="text-xs">Today</Badge>
                    )}
                    {dayItems.length > 0 && (
                      <Badge variant="outline" className="text-xs ml-auto">
                        {dayItems.length} event{dayItems.length !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                  <AgendaList items={dayItems} onItemClick={handleItemClick} />
                </div>
              );
            })}
          </div>
        ) : (
          // Day view - detailed list for single day
          <div>
            <AgendaList 
              items={filteredItems} 
              onItemClick={handleItemClick}
              showEmpty
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface AgendaListProps {
  items: AgendaItem[];
  onItemClick: (item: AgendaItem) => void;
  showEmpty?: boolean;
}

function AgendaList({ items, onItemClick, showEmpty = false }: AgendaListProps) {
  if (items.length === 0) {
    if (showEmpty) {
      return (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No events scheduled for this day
        </p>
      );
    }
    return null;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors hover:bg-accent/50",
            item.isOverdue && "border-destructive/50 bg-destructive/5"
          )}
          onClick={() => onItemClick(item)}
        >
          <div className={cn(
            "p-1.5 rounded",
            item.type === "task" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
          )}>
            {item.type === "task" ? (
              <ListTodo className="h-4 w-4" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{item.title}</p>
            <p className="text-xs text-muted-foreground truncate">
              {item.policyholderName || item.claimNumber}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {item.time && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {item.time.slice(0, 5)}
              </span>
            )}
            {item.isOverdue && (
              <Badge variant="destructive" className="text-xs">Overdue</Badge>
            )}
            {item.status === "completed" && (
              <Badge variant="secondary" className="text-xs">Done</Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
