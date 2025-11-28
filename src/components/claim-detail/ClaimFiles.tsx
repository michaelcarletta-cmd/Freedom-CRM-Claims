import { Button } from "@/components/ui/button";
import { FileText, Image, Download, Upload, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface File {
  id: string;
  name: string;
  type: "document" | "image" | "pdf";
  size: string;
  uploadedBy: string;
  uploadedAt: string;
  category: string;
}

const mockFiles: File[] = [
  {
    id: "1",
    name: "Initial_Assessment_Report.pdf",
    type: "pdf",
    size: "2.4 MB",
    uploadedBy: "You",
    uploadedAt: "2024-01-15",
    category: "Reports",
  },
  {
    id: "2",
    name: "Property_Damage_Photo_1.jpg",
    type: "image",
    size: "1.8 MB",
    uploadedBy: "John Smith",
    uploadedAt: "2024-01-15",
    category: "Photos",
  },
  {
    id: "3",
    name: "Property_Damage_Photo_2.jpg",
    type: "image",
    size: "2.1 MB",
    uploadedBy: "John Smith",
    uploadedAt: "2024-01-15",
    category: "Photos",
  },
  {
    id: "4",
    name: "Repair_Estimate.pdf",
    type: "pdf",
    size: "856 KB",
    uploadedBy: "Contractor",
    uploadedAt: "2024-01-18",
    category: "Estimates",
  },
  {
    id: "5",
    name: "Insurance_Policy.pdf",
    type: "pdf",
    size: "1.2 MB",
    uploadedBy: "John Smith",
    uploadedAt: "2024-01-16",
    category: "Insurance",
  },
  {
    id: "6",
    name: "Approval_Letter.pdf",
    type: "pdf",
    size: "324 KB",
    uploadedBy: "ABC Insurance",
    uploadedAt: "2024-01-19",
    category: "Insurance",
  },
];

const getFileIcon = (type: string) => {
  if (type === "image") return Image;
  return FileText;
};

export const ClaimFiles = ({ claimId }: { claimId: string }) => {
  const FileIcon = (type: string) => {
    const Icon = getFileIcon(type);
    return <Icon className="h-4 w-4" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Documents & Files</h3>
        <Button className="bg-primary hover:bg-primary/90">
          <Upload className="h-4 w-4 mr-2" />
          Upload File
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {mockFiles.map((file) => (
          <div
            key={file.id}
            className="p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                {FileIcon(file.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    {file.category}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{file.size}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {file.uploadedBy} • {file.uploadedAt}
                </p>
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" className="flex-1">
                    <Eye className="h-3 w-3 mr-1" />
                    View
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
