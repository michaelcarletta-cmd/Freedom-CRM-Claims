import { useState, useEffect } from "react";
import { Plus, Search, Calendar, User, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/useDebounce";

interface Claim {
  id: string;
  claim_number: string;
  status: string;
  loss_type: string | null;
  loss_date: string | null;
  clients: {
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
}

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string;
}

export function QuickTaskBar() {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [claims, setClaims] = useState<Claim[]>([]);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Task form state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState<Date | undefined>();
  const [taskAssignee, setTaskAssignee] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const debouncedSearch = useDebounce(searchQuery, 300);

  useEffect(() => {
    if (open) {
      fetchUsers();
    }
  }, [open]);

  useEffect(() => {
    if (debouncedSearch.length >= 2) {
      searchClaims(debouncedSearch);
    } else {
      setClaims([]);
    }
  }, [debouncedSearch]);

  const fetchUsers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name");
    
    if (data) {
      setUsers(data);
    }
  };

  const searchClaims = async (query: string) => {
    setIsSearching(true);
    const { data } = await supabase
      .from("claims")
      .select(`
        id,
        claim_number,
        status,
        loss_type,
        loss_date,
        clients (
          name,
          email,
          phone
        )
      `)
      .or(`claim_number.ilike.%${query}%,clients.name.ilike.%${query}%`)
      .limit(10);
    
    if (data) {
      setClaims(data);
    }
    setIsSearching(false);
  };

  const handleSelectClaim = (claim: Claim) => {
    setSelectedClaim(claim);
    setSearchQuery("");
    setClaims([]);
  };

  const handleClearSelection = () => {
    setSelectedClaim(null);
    setTaskTitle("");
    setTaskDueDate(undefined);
    setTaskAssignee("");
  };

  const handleSubmitTask = async () => {
    if (!selectedClaim || !taskTitle.trim()) {
      toast.error("Please select a claim and enter a task title");
      return;
    }

    setIsSubmitting(true);
    
    const { error } = await supabase
      .from("tasks")
      .insert({
        claim_id: selectedClaim.id,
        title: taskTitle.trim(),
        due_date: taskDueDate ? format(taskDueDate, "yyyy-MM-dd") : null,
        assigned_to: taskAssignee || null,
        status: "pending",
        priority: "medium",
      });

    if (error) {
      toast.error("Failed to create task");
      console.error(error);
    } else {
      toast.success("Task created successfully");
      handleClearSelection();
      setOpen(false);
    }
    
    setIsSubmitting(false);
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "open":
        return "bg-blue-500/10 text-blue-500";
      case "in progress":
        return "bg-yellow-500/10 text-yellow-500";
      case "closed":
        return "bg-green-500/10 text-green-500";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title="Quick Task">
          <Plus className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="end">
        <div className="p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Quick Task
          </h3>
          <p className="text-sm text-muted-foreground">
            Search for a client to add a task
          </p>
        </div>

        <div className="p-4 space-y-4">
          {/* Search Section */}
          {!selectedClaim && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by client name or claim number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {isSearching && (
                <p className="text-sm text-muted-foreground text-center py-2">Searching...</p>
              )}

              {claims.length > 0 && (
                <ScrollArea className="h-[200px] border rounded-md">
                  <div className="divide-y">
                    {claims.map((claim) => (
                      <div
                        key={claim.id}
                        className="p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => handleSelectClaim(claim)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-sm">{claim.clients?.name || "Unknown Client"}</p>
                            <p className="text-xs text-muted-foreground">{claim.claim_number}</p>
                          </div>
                          <Badge className={cn("text-xs", getStatusColor(claim.status))}>
                            {claim.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {searchQuery.length >= 2 && claims.length === 0 && !isSearching && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No claims found
                </p>
              )}
            </div>
          )}

          {/* Selected Claim Info */}
          {selectedClaim && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="font-medium">{selectedClaim.clients?.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearSelection}
                    className="h-6 px-2 text-xs"
                  >
                    Change
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Claim:</span>{" "}
                    <span className="font-medium">{selectedClaim.claim_number}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>{" "}
                    <Badge className={cn("text-xs", getStatusColor(selectedClaim.status))}>
                      {selectedClaim.status}
                    </Badge>
                  </div>
                  {selectedClaim.loss_type && (
                    <div>
                      <span className="text-muted-foreground">Loss Type:</span>{" "}
                      <span>{selectedClaim.loss_type}</span>
                    </div>
                  )}
                  {selectedClaim.loss_date && (
                    <div>
                      <span className="text-muted-foreground">DOL:</span>{" "}
                      <span>{format(new Date(selectedClaim.loss_date), "MMM d, yyyy")}</span>
                    </div>
                  )}
                </div>
                {selectedClaim.clients?.phone && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Phone:</span>{" "}
                    <span>{selectedClaim.clients.phone}</span>
                  </div>
                )}
              </div>

              {/* Task Form */}
              <div className="space-y-3">
                <Input
                  placeholder="Task title..."
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                />

                <div className="grid grid-cols-2 gap-2">
                  <Popover open={showCalendar} onOpenChange={setShowCalendar}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal",
                          !taskDueDate && "text-muted-foreground"
                        )}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {taskDueDate ? format(taskDueDate, "MMM d") : "Due date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={taskDueDate}
                        onSelect={(date) => {
                          setTaskDueDate(date);
                          setShowCalendar(false);
                        }}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>

                  <Select value={taskAssignee} onValueChange={setTaskAssignee}>
                    <SelectTrigger>
                      <User className="mr-2 h-4 w-4" />
                      <SelectValue placeholder="Assign to" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name || user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full"
                  onClick={handleSubmitTask}
                  disabled={!taskTitle.trim() || isSubmitting}
                >
                  {isSubmitting ? "Creating..." : "Add Task"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
