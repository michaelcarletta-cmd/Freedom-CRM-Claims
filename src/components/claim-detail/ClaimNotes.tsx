import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface Note {
  id: string;
  author: string;
  content: string;
  timestamp: string;
}

const mockNotes: Note[] = [
  {
    id: "1",
    author: "You",
    content: "Initial inspection completed. Found significant water damage in basement and first floor. Estimated repair cost $45,000.",
    timestamp: "2024-01-15 10:30 AM",
  },
  {
    id: "2",
    author: "Sarah Mitchell",
    content: "Adjuster visited property. Confirmed damage assessment. Proceeding with approval process.",
    timestamp: "2024-01-18 2:15 PM",
  },
  {
    id: "3",
    author: "You",
    content: "Client approved repair schedule. Contractors lined up for next week.",
    timestamp: "2024-01-20 9:00 AM",
  },
];

export const ClaimNotes = ({ claimId }: { claimId: string }) => {
  const [notes, setNotes] = useState<Note[]>(mockNotes);
  const [newNote, setNewNote] = useState("");

  const handleAddNote = () => {
    if (newNote.trim()) {
      const note: Note = {
        id: Date.now().toString(),
        author: "You",
        content: newNote,
        timestamp: new Date().toLocaleString(),
      };
      setNotes([note, ...notes]);
      setNewNote("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Textarea
          placeholder="Add a note or update..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          className="min-h-[100px]"
        />
        <Button onClick={handleAddNote} className="w-full bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" />
          Add Note
        </Button>
      </div>

      <div className="space-y-4">
        {notes.map((note) => (
          <div key={note.id} className="flex gap-3 p-4 rounded-lg bg-muted/50">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {note.author.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{note.author}</span>
                <span className="text-xs text-muted-foreground">{note.timestamp}</span>
              </div>
              <p className="text-sm text-foreground">{note.content}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
