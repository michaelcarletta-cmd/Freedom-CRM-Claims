import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { FileText, FolderOpen, Loader2, CheckSquare } from "lucide-react";
import { format } from "date-fns";
import { ClaimFileOption } from "@/hooks/useClaimFiles";

interface MultiClaimFileSelectorProps {
  files: ClaimFileOption[];
  loading: boolean;
  selectedFileIds: Set<string>;
  onToggleFile: (fileId: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  emptyMessage?: string;
  height?: string;
  showActions?: boolean;
}

export const MultiClaimFileSelector = ({
  files,
  loading,
  selectedFileIds,
  onToggleFile,
  onSelectAll,
  onClearAll,
  emptyMessage = "No PDF documents found in this claim.",
  height = "200px",
  showActions = true
}: MultiClaimFileSelectorProps) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 border rounded-md">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading files...</span>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="border rounded-md p-6 text-center text-muted-foreground">
        <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {showActions && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {selectedFileIds.size} of {files.length} selected
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onSelectAll}>
              <CheckSquare className="h-4 w-4 mr-1" />
              Select All
            </Button>
            <Button variant="ghost" size="sm" onClick={onClearAll}>
              Clear
            </Button>
          </div>
        </div>
      )}
      
      <ScrollArea className="border rounded-md p-2" style={{ height }}>
        <div className="space-y-1">
          {files.map(file => (
            <div
              key={file.id}
              className={`flex items-center gap-2 p-2.5 rounded-md cursor-pointer transition-colors hover:bg-muted/50 ${
                selectedFileIds.has(file.id) ? 'bg-primary/10 border border-primary' : 'border border-transparent'
              }`}
              onClick={() => onToggleFile(file.id)}
            >
              <Checkbox
                checked={selectedFileIds.has(file.id)}
                onCheckedChange={() => onToggleFile(file.id)}
              />
              <FileText className="h-4 w-4 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.file_name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {file.folder_name && (
                    <span className="flex items-center gap-1">
                      <FolderOpen className="h-3 w-3" />
                      {file.folder_name}
                    </span>
                  )}
                  {file.uploaded_at && (
                    <span>{format(new Date(file.uploaded_at), 'MMM d, yyyy')}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
