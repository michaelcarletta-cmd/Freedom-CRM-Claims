import { useEffect, useRef, useState } from "react";
import { Canvas as FabricCanvas, Rect, Textbox, FabricImage } from "fabric";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Pencil, Calendar, Type, Trash2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Field {
  id: string;
  type: "signature" | "date" | "text";
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  required: boolean;
  signerIndex?: number;
  page?: number;
}

interface FieldPlacementEditorProps {
  documentUrl: string;
  onFieldsChange: (fields: Field[]) => void;
  signerCount: number;
}

export function FieldPlacementEditor({ documentUrl, onFieldsChange, signerCount }: FieldPlacementEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [activeTool, setActiveTool] = useState<"signature" | "date" | "text" | null>(null);
  const [currentSignerIndex, setCurrentSignerIndex] = useState(0);
  const [isPdf, setIsPdf] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Save template dialog state
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");

  // Load template state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  
  // PDF page tracking
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch available templates
  const { data: templates } = useQuery({
    queryKey: ["signature-field-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signature_field_templates")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Save template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("signature_field_templates")
        .insert([{
          name: templateName,
          description: templateDescription,
          field_data: fields as any,
        }]);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Field layout template saved successfully" });
      setIsSaveDialogOpen(false);
      setTemplateName("");
      setTemplateDescription("");
      queryClient.invalidateQueries({ queryKey: ["signature-field-templates"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save template", description: error.message, variant: "destructive" });
    },
  });

  // Initialize canvas - single effect that handles both PDF and non-PDF
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Check if it's a PDF by looking at the URL
    const isPdfDocument = documentUrl.toLowerCase().includes('.pdf') || 
      documentUrl.includes('application/pdf');
    
    setIsPdf(isPdfDocument);
    
    // For PDFs, just show in iframe - no canvas needed
    if (isPdfDocument) {
      setIsLoading(false);
      toast({ title: "PDF loaded! Add signature and date fields using the overlay." });
      return;
    }
    
    // For non-PDF documents, initialize the canvas
    if (!canvasRef.current) return;

    const initCanvas = async () => {
      setIsLoading(true);

      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = documentUrl;

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        const containerWidth = containerRef.current?.clientWidth || 800;
        const scale = Math.min(containerWidth / img.width, 1);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;

        const canvas = new FabricCanvas(canvasRef.current!, {
          width: scaledWidth,
          height: scaledHeight,
          backgroundColor: "#ffffff",
          selection: true,
        });

        const bgImage = await FabricImage.fromURL(documentUrl);
        bgImage.scaleX = scale;
        bgImage.scaleY = scale;
        canvas.backgroundImage = bgImage;
        canvas.renderAll();
        
        setFabricCanvas(canvas);
        toast({ title: "Document loaded! Add signature and date fields." });

        canvas.on("object:modified", () => {
          updateFieldsFromCanvas(canvas);
        });
      } catch (error) {
        console.error("Failed to load document:", error);
        toast({ 
          title: "Failed to load document", 
          description: "Unable to display document for field placement",
          variant: "destructive" 
        });
      }

      setIsLoading(false);
    };

    initCanvas();

    return () => {
      fabricCanvas?.dispose();
    };
  }, [documentUrl, isPdf]);

  // Canvas click handler for non-PDF
  useEffect(() => {
    if (!fabricCanvas || isPdf) return;

    const handleCanvasClick = (e: any) => {
      if (!activeTool || e.target) return;

      const pointer = fabricCanvas.getPointer(e.e);
      addField(activeTool, pointer.x, pointer.y);
      setActiveTool(null);
    };

    fabricCanvas.on("mouse:down", handleCanvasClick);

    return () => {
      fabricCanvas.off("mouse:down", handleCanvasClick);
    };
  }, [fabricCanvas, activeTool, currentSignerIndex, isPdf]);

  // PDF overlay click handler
  const [pendingClickPos, setPendingClickPos] = useState<{x: number, y: number} | null>(null);
  
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!overlayRef.current) return;
    
    // Prevent if clicking on an existing field
    if ((e.target as HTMLElement).closest('.field-indicator')) return;
    if ((e.target as HTMLElement).closest('.field-picker')) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool) {
      // If tool already selected, place field immediately
      addFieldForPdf(activeTool, x, y);
      setActiveTool(null);
    } else {
      // Show field type picker at click location
      setPendingClickPos({ x, y });
    }
  };
  
  const handleSelectFieldType = (type: "signature" | "date" | "text") => {
    if (pendingClickPos) {
      addFieldForPdf(type, pendingClickPos.x, pendingClickPos.y);
      setPendingClickPos(null);
    }
  };

  const addFieldForPdf = (type: "signature" | "date" | "text", x: number, y: number) => {
    const fieldId = `${type}-${Date.now()}`;
    const width = type === "signature" ? 200 : type === "date" ? 120 : 150;
    const height = type === "signature" ? 60 : 30;

    const newField: Field = {
      id: fieldId,
      type,
      x,
      y,
      width,
      height,
      label: type === "signature" ? `Signature ${currentSignerIndex + 1}` :
             type === "date" ? "Date" : "Text Field",
      required: true,
      signerIndex: currentSignerIndex,
      page: currentPage,
    };

    const updatedFields = [...fields, newField];
    setFields(updatedFields);
    onFieldsChange(updatedFields);

    toast({ title: `${type} field added to page ${currentPage}` });
  };

  // Drag handling for PDF fields
  const [draggingField, setDraggingField] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleFieldMouseDown = (e: React.MouseEvent, fieldId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;
    
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setDraggingField(fieldId);
  };

  const handleOverlayMouseMove = (e: React.MouseEvent) => {
    if (!draggingField || !overlayRef.current) return;
    
    const rect = overlayRef.current.getBoundingClientRect();
    const newX = e.clientX - rect.left - dragOffset.x;
    const newY = e.clientY - rect.top - dragOffset.y;
    
    setFields(prev => prev.map(f => 
      f.id === draggingField ? { ...f, x: Math.max(0, newX), y: Math.max(0, newY) } : f
    ));
  };

  const handleOverlayMouseUp = () => {
    if (draggingField) {
      setDraggingField(null);
      onFieldsChange(fields);
    }
  };

  const addFieldToCanvas = (field: Field) => {
    if (!fabricCanvas) return;

    const colors: Record<string, string> = {
      signature: "#3b82f6",
      date: "#10b981",
      text: "#8b5cf6",
    };

    const rect = new Rect({
      left: field.x,
      top: field.y,
      width: field.width,
      height: field.height,
      fill: colors[field.type] + "33",
      stroke: colors[field.type],
      strokeWidth: 2,
      strokeDashArray: [5, 5],
      cornerColor: colors[field.type],
      cornerSize: 8,
      transparentCorners: false,
      data: { fieldId: field.id, type: field.type, signerIndex: field.signerIndex },
    });

    const label = new Textbox(field.label, {
      left: field.x + 5,
      top: field.y + (field.height / 2) - 10,
      fontSize: 14,
      fill: colors[field.type],
      selectable: false,
      evented: false,
      fontWeight: "bold",
    });

    fabricCanvas.add(rect);
    fabricCanvas.add(label);
  };

  const addField = (type: "signature" | "date" | "text", x: number, y: number) => {
    if (!fabricCanvas) return;

    const fieldId = `${type}-${Date.now()}`;
    const width = type === "signature" ? 200 : type === "date" ? 120 : 150;
    const height = type === "signature" ? 60 : 30;

    const newField: Field = {
      id: fieldId,
      type,
      x,
      y,
      width,
      height,
      label: type === "signature" ? `Signature ${currentSignerIndex + 1}` :
             type === "date" ? "Date" : "Text Field",
      required: true,
      signerIndex: currentSignerIndex,
    };

    addFieldToCanvas(newField);

    const updatedFields = [...fields, newField];
    setFields(updatedFields);
    onFieldsChange(updatedFields);

    toast({ title: `${type} field added` });
  };

  const updateFieldsFromCanvas = (canvas: FabricCanvas) => {
    const objects = canvas.getObjects();
    const updatedFields = fields.map(field => {
      const obj = objects.find((o: any) => o.data?.fieldId === field.id);
      if (obj && obj.left !== undefined && obj.top !== undefined) {
        return {
          ...field,
          x: obj.left,
          y: obj.top,
          width: obj.width || field.width,
          height: obj.height || field.height,
        };
      }
      return field;
    });
    setFields(updatedFields);
    onFieldsChange(updatedFields);
  };

  const clearAllFields = () => {
    if (!isPdf && fabricCanvas) {
      fabricCanvas.getObjects().forEach(obj => {
        if ((obj as any).data?.fieldId) {
          fabricCanvas.remove(obj);
        }
      });
    }
    
    setFields([]);
    onFieldsChange([]);
    toast({ title: "All fields cleared" });
  };

  const removeField = (fieldId: string) => {
    if (!isPdf && fabricCanvas) {
      const objects = fabricCanvas.getObjects();
      objects.forEach(obj => {
        if ((obj as any).data?.fieldId === fieldId) {
          fabricCanvas.remove(obj);
        }
      });
      // Also remove associated label
      objects.forEach(obj => {
        if (obj instanceof Textbox && !obj.selectable) {
          fabricCanvas.remove(obj);
        }
      });
    }
    
    const updatedFields = fields.filter(f => f.id !== fieldId);
    setFields(updatedFields);
    onFieldsChange(updatedFields);
  };

  const loadTemplate = (templateId: string) => {
    const template = templates?.find(t => t.id === templateId);
    if (!template) return;

    // Clear existing fields
    clearAllFields();

    // Load template fields with proper type casting
    const templateFields = (Array.isArray(template.field_data) ? template.field_data : []) as unknown as Field[];
    
    if (!isPdf && fabricCanvas) {
      templateFields.forEach((field) => {
        addFieldToCanvas(field);
      });
    }

    setFields(templateFields);
    onFieldsChange(templateFields);
    toast({ title: `Template "${template.name}" loaded` });
  };

  const colors: Record<string, string> = {
    signature: "#3b82f6",
    date: "#10b981",
    text: "#8b5cf6",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Label>Place Fields on Document</Label>
        <div className="flex gap-2 flex-wrap">
          {/* Load Template */}
          <div className="flex items-center gap-2">
            <Select value={selectedTemplateId} onValueChange={(id) => { setSelectedTemplateId(id); loadTemplate(id); }}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Load template..." />
              </SelectTrigger>
              <SelectContent>
                {templates?.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Save Template */}
          <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={fields.length === 0}>
                <Save className="w-4 h-4 mr-2" />
                Save as Template
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save Field Layout Template</DialogTitle>
                <DialogDescription>
                  Save this field layout to reuse on other documents
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Template Name</Label>
                  <Input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g., Standard Contract Layout"
                  />
                </div>
                <div>
                  <Label>Description (optional)</Label>
                  <Textarea
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="Describe when to use this template..."
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => saveTemplateMutation.mutate()}
                  disabled={!templateName || saveTemplateMutation.isPending}
                >
                  {saveTemplateMutation.isPending ? "Saving..." : "Save Template"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {signerCount > 1 && (
            <div className="flex items-center gap-2">
              <Label className="text-sm">For Signer:</Label>
              <div className="flex gap-1">
                {Array.from({ length: signerCount }, (_, i) => (
                  <Button
                    key={i}
                    variant={currentSignerIndex === i ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentSignerIndex(i)}
                  >
                    {i + 1}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={clearAllFields}>
            <Trash2 className="w-4 h-4 mr-2" />
            Clear All
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex gap-2 mb-4 flex-wrap">
          <Button
            variant={activeTool === "signature" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTool(activeTool === "signature" ? null : "signature")}
          >
            <Pencil className="w-4 h-4 mr-2" />
            Add Signature
          </Button>
          <Button
            variant={activeTool === "date" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTool(activeTool === "date" ? null : "date")}
          >
            <Calendar className="w-4 h-4 mr-2" />
            Add Date
          </Button>
          <Button
            variant={activeTool === "text" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTool(activeTool === "text" ? null : "text")}
          >
            <Type className="w-4 h-4 mr-2" />
            Add Text
          </Button>
        </div>

        {activeTool && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
            Click on the page template to place a {activeTool} field
          </div>
        )}
        
        {!activeTool && fields.length > 0 && isPdf && (
          <div className="mb-4 p-3 bg-muted border border-border rounded text-sm text-muted-foreground">
            Drag fields to reposition. Double-click a field to remove it.
          </div>
        )}
        
        {isPdf && (
          <div className="mb-4 flex gap-2 flex-wrap items-center">
            <span className="text-sm font-medium">Page:</span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                -
              </Button>
              <Input
                type="number"
                min={1}
                value={currentPage}
                onChange={(e) => setCurrentPage(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 h-8 text-center"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => p + 1)}
              >
                +
              </Button>
            </div>
            <span className="text-sm text-muted-foreground">
              ({fields.filter(f => f.page === currentPage).length} fields on this page)
            </span>
          </div>
        )}

        <div ref={containerRef} className="border rounded overflow-auto bg-gray-50">
          {isLoading && (
            <div className="flex items-center justify-center h-96">
              <p className="text-muted-foreground">Loading document...</p>
            </div>
          )}
          
          {/* PDF Field Placement - Side by side with preview */}
          {isPdf && !isLoading && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-sm px-4">
                <span className="text-muted-foreground">PDF Document</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(documentUrl);
                    toast({ title: "PDF URL copied to clipboard" });
                  }}
                >
                  Copy URL
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(documentUrl, '_blank')}
                >
                  Open in New Tab
                </Button>
              </div>
              
              <div className="flex gap-4 p-4">
                {/* PDF Preview - Left side using Google Docs Viewer */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground mb-2 text-center">PDF Preview (scroll to view)</div>
                  <iframe
                    src={`https://docs.google.com/viewer?url=${encodeURIComponent(documentUrl)}&embedded=true`}
                    className="w-full h-[700px] border rounded bg-white"
                    title="PDF Preview"
                  />
                </div>
                
                {/* Field Placement Template - Right side */}
                <div className="flex-shrink-0">
                  <div className="text-xs text-muted-foreground mb-2 text-center">Click to place fields (Page {currentPage})</div>
                  <div
                    ref={overlayRef}
                    className={`relative bg-white shadow-lg border ${activeTool ? 'cursor-crosshair ring-2 ring-primary' : 'cursor-pointer'}`}
                    style={{ width: '400px', height: '518px' }} /* Scaled down letter size */
                    onClick={handleOverlayClick}
                    onMouseMove={handleOverlayMouseMove}
                    onMouseUp={handleOverlayMouseUp}
                    onMouseLeave={handleOverlayMouseUp}
                  >
                    {/* Visual guide lines */}
                    <div className="absolute inset-2 border border-dashed border-muted/50 pointer-events-none" />
                    
                    {/* Click instruction when no fields */}
                    {fields.filter(f => f.page === currentPage).length === 0 && !activeTool && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="text-center text-muted-foreground text-sm px-4">
                          <p>Click anywhere to add a field</p>
                          <p className="text-xs mt-1">Match position to PDF on left</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Click instruction when tool is active */}
                    {activeTool && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="bg-primary/10 text-primary px-4 py-2 rounded text-sm font-medium">
                          Click to place {activeTool}
                        </div>
                      </div>
                    )}
                    
                    {/* Render draggable field indicators - only for current page */}
                    {fields.filter(f => f.page === currentPage).map((field) => (
                      <div
                        key={field.id}
                        className={`field-indicator absolute border-2 border-dashed flex items-center justify-center text-xs font-bold select-none ${
                          draggingField === field.id ? 'opacity-70' : ''
                        } ${!activeTool ? 'cursor-move' : ''}`}
                        style={{
                          left: field.x * (400/612), /* Scale position */
                          top: field.y * (518/792),
                          width: field.width * (400/612),
                          height: field.height * (518/792),
                          borderColor: colors[field.type],
                          backgroundColor: colors[field.type] + "33",
                          color: colors[field.type],
                        }}
                        onMouseDown={(e) => !activeTool && handleFieldMouseDown(e, field.id)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          removeField(field.id);
                        }}
                      >
                        {field.label}
                      </div>
                    ))}
                    
                    {/* Field type picker popup */}
                    {pendingClickPos && (
                      <div 
                        className="field-picker absolute bg-popover border rounded-lg shadow-lg p-2 z-50"
                        style={{ 
                          left: Math.min(pendingClickPos.x * (400/612), 250), 
                          top: pendingClickPos.y * (518/792) 
                        }}
                      >
                        <div className="text-xs text-muted-foreground mb-2">Select field type:</div>
                        <div className="flex flex-col gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="justify-start"
                            onClick={() => handleSelectFieldType("signature")}
                          >
                            <Pencil className="w-4 h-4 mr-2 text-blue-500" />
                            Signature
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="justify-start"
                            onClick={() => handleSelectFieldType("date")}
                          >
                            <Calendar className="w-4 h-4 mr-2 text-green-500" />
                            Date
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="justify-start"
                            onClick={() => handleSelectFieldType("text")}
                          >
                            <Type className="w-4 h-4 mr-2 text-purple-500" />
                            Text
                          </Button>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full mt-1 text-muted-foreground"
                          onClick={() => setPendingClickPos(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Canvas for non-PDF documents */}
          {!isPdf && (
            <canvas ref={canvasRef} style={{ display: isLoading ? 'none' : 'block' }} />
          )}
        </div>

        {fields.length > 0 && (
          <div className="mt-4">
            <Label className="text-sm mb-2 block">Placed Fields ({fields.length}) - {isPdf ? "Double-click field on document or click badge to remove" : "Click field to remove"}</Label>
            <div className="flex flex-wrap gap-2">
              {fields.map((field) => (
                <Badge 
                  key={field.id} 
                  variant="outline"
                  className={`cursor-pointer hover:bg-destructive/10 ${field.page === currentPage ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => removeField(field.id)}
                >
                  {field.label} {field.page && `(P${field.page})`} {field.signerIndex !== undefined && `S${field.signerIndex + 1}`}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
