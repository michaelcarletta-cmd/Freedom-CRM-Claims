import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { 
  FileText, 
  Image, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  File,
  FileImage,
  FileSpreadsheet,
  Video
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EvidenceArsenalProps {
  claimId: string;
  insights?: any;
}

interface EvidenceItem {
  id: string;
  name: string;
  type: 'document' | 'photo' | 'video' | 'spreadsheet';
  strength: 'strong' | 'weak' | 'missing';
  category: string;
  description?: string;
}

interface EvidenceCategory {
  name: string;
  items: EvidenceItem[];
  status: 'complete' | 'partial' | 'missing';
}

export const EvidenceArsenal = ({ claimId, insights }: EvidenceArsenalProps) => {
  const [files, setFiles] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvidence();
  }, [claimId]);

  const loadEvidence = async () => {
    setLoading(true);
    try {
      const [filesResult, photosResult] = await Promise.all([
        supabase.from('claim_files').select('*').eq('claim_id', claimId),
        supabase.from('claim_photos').select('*').eq('claim_id', claimId)
      ]);

      setFiles(filesResult.data || []);
      setPhotos(photosResult.data || []);
    } catch (error) {
      console.error("Error loading evidence:", error);
    } finally {
      setLoading(false);
    }
  };

  // Analyze evidence inventory
  const analyzeEvidence = (): EvidenceCategory[] => {
    const categories: EvidenceCategory[] = [];

    // Core Documents
    const hasEstimate = files.some(f => f.file_name?.toLowerCase().includes('estimate'));
    const hasPolicy = files.some(f => f.file_name?.toLowerCase().includes('policy'));
    const hasDenial = files.some(f => f.file_name?.toLowerCase().includes('denial'));
    const hasProofOfLoss = files.some(f => 
      f.file_name?.toLowerCase().includes('proof of loss') || 
      f.file_name?.toLowerCase().includes('pol')
    );

    categories.push({
      name: 'Core Documents',
      status: hasEstimate && hasPolicy ? 'complete' : hasEstimate || hasPolicy ? 'partial' : 'missing',
      items: [
        { id: 'estimate', name: 'Repair Estimate', type: 'document', strength: hasEstimate ? 'strong' : 'missing', category: 'Core' },
        { id: 'policy', name: 'Insurance Policy', type: 'document', strength: hasPolicy ? 'strong' : 'missing', category: 'Core' },
        { id: 'proof-loss', name: 'Proof of Loss', type: 'document', strength: hasProofOfLoss ? 'strong' : 'missing', category: 'Core' },
        { id: 'denial', name: 'Denial Letter', type: 'document', strength: hasDenial ? 'strong' : 'weak', category: 'Core', description: hasDenial ? 'Available for analysis' : 'Not received or not uploaded' }
      ]
    });

    // Photo Evidence
    const categorizedPhotos = photos.filter(p => p.category && p.category !== 'uncategorized');
    const annotatedPhotos = photos.filter(p => p.annotations);
    
    categories.push({
      name: 'Photo Evidence',
      status: photos.length >= 20 && annotatedPhotos.length > 0 ? 'complete' : photos.length >= 10 ? 'partial' : 'missing',
      items: [
        { id: 'photos-total', name: `${photos.length} Total Photos`, type: 'photo', strength: photos.length >= 20 ? 'strong' : photos.length >= 10 ? 'weak' : 'missing', category: 'Photos' },
        { id: 'photos-categorized', name: `${categorizedPhotos.length} Categorized`, type: 'photo', strength: categorizedPhotos.length > 0 ? 'strong' : 'weak', category: 'Photos' },
        { id: 'photos-annotated', name: `${annotatedPhotos.length} Annotated`, type: 'photo', strength: annotatedPhotos.length > 0 ? 'strong' : 'weak', category: 'Photos' }
      ]
    });

    // Technical Support
    const hasEngineerReport = files.some(f => f.file_name?.toLowerCase().includes('engineer'));
    const hasMoistureReport = files.some(f => f.file_name?.toLowerCase().includes('moisture'));
    const hasContractorBid = files.some(f => 
      f.file_name?.toLowerCase().includes('contractor') || 
      f.file_name?.toLowerCase().includes('invoice') ||
      f.file_name?.toLowerCase().includes('bid')
    );

    categories.push({
      name: 'Technical Support',
      status: hasContractorBid ? 'complete' : 'partial',
      items: [
        { id: 'engineer', name: 'Engineer Report', type: 'document', strength: hasEngineerReport ? 'strong' : 'weak', category: 'Technical' },
        { id: 'moisture', name: 'Moisture Report', type: 'document', strength: hasMoistureReport ? 'strong' : 'weak', category: 'Technical' },
        { id: 'contractor', name: 'Contractor Bid/Invoice', type: 'document', strength: hasContractorBid ? 'strong' : 'missing', category: 'Technical' }
      ]
    });

    // Add evidence gaps from insights
    if (insights?.evidence_gaps && Array.isArray(insights.evidence_gaps)) {
      categories.push({
        name: 'Identified Gaps',
        status: 'missing',
        items: insights.evidence_gaps.slice(0, 5).map((gap: any, i: number) => ({
          id: `gap-${i}`,
          name: typeof gap === 'string' ? gap : gap.description || gap.item || 'Missing item',
          type: 'document' as const,
          strength: 'missing' as const,
          category: 'Gaps',
          description: typeof gap === 'object' ? gap.recommendation : undefined
        }))
      });
    }

    return categories;
  };

  const categories = analyzeEvidence();

  // Calculate overall evidence score
  const calculateScore = () => {
    let total = 0;
    let score = 0;
    categories.forEach(cat => {
      cat.items.forEach(item => {
        total++;
        if (item.strength === 'strong') score += 1;
        else if (item.strength === 'weak') score += 0.5;
      });
    });
    return total > 0 ? Math.round((score / total) * 100) : 0;
  };

  const evidenceScore = calculateScore();

  const getStrengthIcon = (strength: EvidenceItem['strength']) => {
    switch (strength) {
      case 'strong': return <CheckCircle2 className="h-3 w-3 text-green-600" />;
      case 'weak': return <AlertCircle className="h-3 w-3 text-yellow-600" />;
      case 'missing': return <XCircle className="h-3 w-3 text-red-600" />;
    }
  };

  const getTypeIcon = (type: EvidenceItem['type']) => {
    switch (type) {
      case 'photo': return <FileImage className="h-3 w-3" />;
      case 'video': return <Video className="h-3 w-3" />;
      case 'spreadsheet': return <FileSpreadsheet className="h-3 w-3" />;
      default: return <FileText className="h-3 w-3" />;
    }
  };

  const getStatusColor = (status: EvidenceCategory['status']) => {
    switch (status) {
      case 'complete': return 'bg-green-500';
      case 'partial': return 'bg-yellow-500';
      case 'missing': return 'bg-red-500';
    }
  };

  if (loading) {
    return <div className="text-center text-muted-foreground text-sm">Loading evidence...</div>;
  }

  return (
    <div className="space-y-3">
      {/* Evidence Score */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Progress value={evidenceScore} className="h-2" />
        </div>
        <Badge variant={evidenceScore >= 75 ? 'default' : evidenceScore >= 50 ? 'secondary' : 'destructive'}>
          {evidenceScore}%
        </Badge>
      </div>

      <ScrollArea className="h-[220px]">
        <div className="space-y-3">
          {categories.map(category => (
            <div key={category.name} className="space-y-1">
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", getStatusColor(category.status))} />
                <span className="text-xs font-medium">{category.name}</span>
              </div>
              <div className="ml-4 space-y-1">
                {category.items.map(item => (
                  <div 
                    key={item.id} 
                    className={cn(
                      "flex items-center gap-2 text-xs p-1.5 rounded",
                      item.strength === 'strong' ? 'bg-green-50 dark:bg-green-950/20' :
                      item.strength === 'weak' ? 'bg-yellow-50 dark:bg-yellow-950/20' :
                      'bg-red-50 dark:bg-red-950/20'
                    )}
                  >
                    {getStrengthIcon(item.strength)}
                    <span className="text-muted-foreground">{getTypeIcon(item.type)}</span>
                    <span className={cn(
                      "flex-1",
                      item.strength === 'missing' && 'text-red-600 dark:text-red-400'
                    )}>
                      {item.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};
