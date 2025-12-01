import { useEffect, useRef, useState } from "react";
import { Canvas as FabricCanvas, Rect, Textbox, FabricImage } from "fabric";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Pencil, Calendar, Type, Trash2, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

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
}

interface FieldPlacementEditorProps {
  documentUrl: string;
  onFieldsChange: (fields: Field[]) => void;
  signerCount: number;
}

export function FieldPlacementEditor({ documentUrl, onFieldsChange, signerCount }: FieldPlacementEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [activeTool, setActiveTool] = useState<"signature" | "date" | "text" | null>(null);
  const [currentSignerIndex, setCurrentSignerIndex] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const initCanvas = async () => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = documentUrl;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      }).catch(() => {
        toast({ 
          title: "Failed to load document", 
          description: "Unable to display document for field placement",
          variant: "destructive" 
        });
        return;
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

      try {
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
        toast({ 
          title: "Failed to load document", 
          description: "Unable to display document for field placement",
          variant: "destructive" 
        });
      }
    };

    initCanvas();

    return () => {
      fabricCanvas?.dispose();
    };
  }, [documentUrl]);

  useEffect(() => {
    if (!fabricCanvas) return;

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
  }, [fabricCanvas, activeTool, currentSignerIndex]);

  const addField = (type: "signature" | "date" | "text", x: number, y: number) => {
    if (!fabricCanvas) return;

    const fieldId = `${type}-${Date.now()}`;
    const width = type === "signature" ? 200 : type === "date" ? 120 : 150;
    const height = type === "signature" ? 60 : 30;

    const colors: Record<string, string> = {
      signature: "#3b82f6",
      date: "#10b981",
      text: "#8b5cf6",
    };

    const rect = new Rect({
      left: x,
      top: y,
      width: width,
      height: height,
      fill: colors[type] + "33",
      stroke: colors[type],
      strokeWidth: 2,
      strokeDashArray: [5, 5],
      cornerColor: colors[type],
      cornerSize: 8,
      transparentCorners: false,
      data: { fieldId, type, signerIndex: currentSignerIndex },
    });

    const label = new Textbox(
      type === "signature" ? `Signature ${currentSignerIndex + 1}` :
      type === "date" ? "Date" : "Text Field",
      {
        left: x + 5,
        top: y + (height / 2) - 10,
        fontSize: 14,
        fill: colors[type],
        selectable: false,
        evented: false,
        fontWeight: "bold",
      }
    );

    fabricCanvas.add(rect);
    fabricCanvas.add(label);

    const newField: Field = {
      id: fieldId,
      type,
      x,
      y,
      width,
      height,
      label: label.text || "",
      required: true,
      signerIndex: currentSignerIndex,
    };

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
    if (!fabricCanvas) return;
    
    fabricCanvas.getObjects().forEach(obj => {
      if ((obj as any).data?.fieldId) {
        fabricCanvas.remove(obj);
      }
    });
    
    setFields([]);
    onFieldsChange([]);
    toast({ title: "All fields cleared" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Place Fields on Document</Label>
        <div className="flex gap-2">
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
            Click on the document to place a {activeTool} field
          </div>
        )}

        <div ref={containerRef} className="border rounded overflow-auto bg-gray-50">
          <canvas ref={canvasRef} />
        </div>

        {fields.length > 0 && (
          <div className="mt-4">
            <Label className="text-sm mb-2 block">Placed Fields ({fields.length})</Label>
            <div className="flex flex-wrap gap-2">
              {fields.map((field) => (
                <Badge key={field.id} variant="outline">
                  {field.label} {field.signerIndex !== undefined && `(Signer ${field.signerIndex + 1})`}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
