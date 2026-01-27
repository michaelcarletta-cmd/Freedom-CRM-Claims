import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FileText, FolderOpen, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ClaimFileOption } from "@/hooks/useClaimFiles";

interface ClaimFileSelectorProps {
  files: ClaimFileOption[];
  loading: boolean;
  selectedFileId: string | null;
  onSelectFile: (file: ClaimFileOption) => void;
  emptyMessage?: string;
  height?: string;
}

export const ClaimFileSelector = ({
  files,
  loading,
  selectedFileId,
  onSelectFile,
  emptyMessage = "No PDF documents found in this claim.",
  height = "200px"
}: ClaimFileSelectorProps) => {
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
    <ScrollArea className={`border rounded-md p-2`} style={{ height }}>
      <div className="space-y-1">
        {files.map(file => (
          <div
            key={file.id}
            className={`flex items-center gap-2 p-2.5 rounded-md cursor-pointer transition-colors hover:bg-muted/50 ${
              selectedFileId === file.id ? 'bg-primary/10 border border-primary' : 'border border-transparent'
            }`}
            onClick={() => onSelectFile(file)}
          >
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
            {selectedFileId === file.id && (
              <Badge variant="secondary" className="text-xs">Selected</Badge>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};
