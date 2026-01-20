import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { StickyNote, Save, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";

export const DashboardNotepad = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const debouncedContent = useDebounce(content, 1000);

  const { data: note, isLoading } = useQuery({
    queryKey: ["user-note"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("user_notes")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (note?.content !== undefined) {
      setContent(note.content);
    }
  }, [note?.content]);

  const saveMutation = useMutation({
    mutationFn: async (newContent: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (note) {
        const { error } = await supabase
          .from("user_notes")
          .update({ content: newContent })
          .eq("id", note.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_notes")
          .insert({ user_id: user.id, content: newContent });
        if (error) throw error;
      }
    },
    onMutate: () => {
      setIsSaving(true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-note"] });
      setIsSaving(false);
    },
    onError: (error) => {
      toast({
        title: "Error saving note",
        description: error.message,
        variant: "destructive",
      });
      setIsSaving(false);
    },
  });

  useEffect(() => {
    if (debouncedContent !== note?.content && debouncedContent !== "") {
      saveMutation.mutate(debouncedContent);
    } else if (debouncedContent === "" && note?.content) {
      saveMutation.mutate(debouncedContent);
    }
  }, [debouncedContent]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <StickyNote className="h-5 w-5" />
            Quick Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StickyNote className="h-5 w-5" />
            Quick Notes
          </div>
          {isSaving && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving...
            </div>
          )}
          {!isSaving && content && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Save className="h-3 w-3" />
              Saved
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Textarea
          placeholder="Jot down quick thoughts, reminders, or ideas..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-[150px] resize-none"
        />
      </CardContent>
    </Card>
  );
};
