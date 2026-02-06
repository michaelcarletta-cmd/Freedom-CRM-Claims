// Claim Context Pipeline – single source of truth passed to every stage

export interface ClaimContextPhoto {
  id: string;
  url: string;
  caption: string | null;
}

export interface MeasurementSection {
  [key: string]: any;
}

export interface MeasurementReport {
  source: "eagleview" | "hover" | "symbility" | "other" | null;
  raw_text: string | null;
  sections: {
    roof: MeasurementSection;
    interior: MeasurementSection;
    siding: MeasurementSection;
    gutters: MeasurementSection;
    openings: MeasurementSection;
    notes: string | null;
  };
}

export interface PhotoFinding {
  area: string;
  scope: "interior" | "roof" | "siding" | "gutters" | "other";
  material: string | null;
  damage: string;
  severity: "minor" | "moderate" | "severe";
  recommended_action: "repair" | "replace" | "detach_reset" | "clean" | "inspect";
  confidence: number;
}

export interface ScopeClassification {
  primary_scopes: string[];
  confidence: Record<string, number>;
  missing_info: string[];
}

export interface UserOverrides {
  quality_grade: "standard" | "economy" | "premium";
  include_op: boolean;
  tax_rate: number;
  price_list: string | null;
}

export interface EstimateLineItem {
  line_code: string | null;
  description: string;
  unit: "EA" | "SF" | "LF" | "SQ";
  qty: number;
  qty_basis: "measured" | "allowance";
  assumptions: string | null;
}

export interface EstimateScope {
  scope: string;
  items: EstimateLineItem[];
}

export interface EstimateResult {
  estimate: EstimateScope[];
  missing_info_to_finalize: string[];
  questions_for_user: string[];
}

export interface ClaimContext {
  claim_id: string;
  description: string;
  loss_cause: string | null;
  policy_notes: string | null;
  photos: ClaimContextPhoto[];
  measurement_report: MeasurementReport;
  photo_findings: PhotoFinding[];
  scope_classification: ScopeClassification;
  user_overrides: UserOverrides;
}

export type PipelineStage = "ingest" | "extract" | "classify" | "estimate";
