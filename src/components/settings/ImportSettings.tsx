import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload, Download, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import Papa from "papaparse";

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

const FIELD_MAPPINGS = {
  claim_number: "Claim Number",
  policyholder_name: "Policyholder Name",
  policyholder_email: "Policyholder Email",
  policyholder_phone: "Policyholder Phone",
  policyholder_address: "Policyholder Address",
  loss_date: "Loss Date",
  loss_type: "Loss Type",
  loss_description: "Loss Description",
  insurance_company: "Insurance Company",
  insurance_phone: "Insurance Phone",
  insurance_email: "Insurance Email",
  adjuster_name: "Adjuster Name",
  adjuster_phone: "Adjuster Phone",
  adjuster_email: "Adjuster Email",
  claim_amount: "Claim Amount",
  status: "Status",
  policy_number: "Policy Number",
};

export function ImportSettings() {
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const { toast } = useToast();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    if (!uploadedFile.name.endsWith('.csv')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV file",
        variant: "destructive",
      });
      return;
    }

    setFile(uploadedFile);
    setImportResult(null);

    Papa.parse(uploadedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length === 0) {
          toast({
            title: "Empty file",
            description: "The CSV file contains no data",
            variant: "destructive",
          });
          return;
        }

        const fileHeaders = results.meta.fields || [];
        setHeaders(fileHeaders);
        setCsvData(results.data);

        // Auto-map fields based on similar names
        const autoMapping: Record<string, string> = {};
        Object.keys(FIELD_MAPPINGS).forEach((dbField) => {
          const matchingHeader = fileHeaders.find(
            (h) => h.toLowerCase().replace(/[^a-z0-9]/g, '') === 
                   dbField.toLowerCase().replace(/[^a-z0-9]/g, '')
          );
          if (matchingHeader) {
            autoMapping[dbField] = matchingHeader;
          }
        });
        setFieldMapping(autoMapping);

        toast({
          title: "File loaded",
          description: `Found ${results.data.length} records with ${fileHeaders.length} columns`,
        });
      },
      error: (error) => {
        toast({
          title: "Parse error",
          description: error.message,
          variant: "destructive",
        });
      },
    });
  };

  const handleImport = async () => {
    if (csvData.length === 0) {
      toast({
        title: "No data",
        description: "Please upload a CSV file first",
        variant: "destructive",
      });
      return;
    }

    if (!fieldMapping.claim_number || !fieldMapping.policyholder_name) {
      toast({
        title: "Missing required fields",
        description: "Claim Number and Policyholder Name are required",
        variant: "destructive",
      });
      return;
    }

    setImporting(true);
    setProgress(0);

    const results: ImportResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      
      try {
        // Map CSV columns to database fields
        const claimData: any = {
          claim_number: row[fieldMapping.claim_number],
          policyholder_name: row[fieldMapping.policyholder_name],
        };

        // Add optional fields if mapped
        Object.keys(fieldMapping).forEach((dbField) => {
          const csvColumn = fieldMapping[dbField];
          if (csvColumn && row[csvColumn] && dbField !== 'claim_number' && dbField !== 'policyholder_name') {
            let value = row[csvColumn];
            
            // Handle date fields
            if (dbField === 'loss_date' && value) {
              const date = new Date(value);
              if (!isNaN(date.getTime())) {
                value = date.toISOString().split('T')[0];
              }
            }
            
            // Handle numeric fields
            if (dbField === 'claim_amount' && value) {
              value = parseFloat(value.toString().replace(/[^0-9.-]/g, ''));
            }
            
            claimData[dbField] = value;
          }
        });

        // Insert claim
        const { error } = await supabase
          .from("claims")
          .insert(claimData);

        if (error) {
          results.failed++;
          results.errors.push(
            `Row ${i + 1} (${claimData.claim_number}): ${error.message}`
          );
        } else {
          results.success++;
        }
      } catch (error: any) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: ${error.message}`);
      }

      setProgress(Math.round(((i + 1) / csvData.length) * 100));
    }

    setImportResult(results);
    setImporting(false);

    toast({
      title: "Import complete",
      description: `Successfully imported ${results.success} claims. ${results.failed} failed.`,
      variant: results.failed > 0 ? "destructive" : "default",
    });
  };

  const downloadTemplate = () => {
    const headers = Object.values(FIELD_MAPPINGS).join(",");
    const sampleRow = [
      "CLM-2025-001",
      "John Doe",
      "john@example.com",
      "555-0123",
      "123 Main St, City, State 12345",
      "2025-01-15",
      "Fire",
      "Kitchen fire damage",
      "State Farm",
      "555-0199",
      "claims@statefarm.com",
      "Jane Smith",
      "555-0188",
      "jane.smith@statefarm.com",
      "25000",
      "open",
      "POL-123456"
    ].join(",");

    const csv = `${headers}\n${sampleRow}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "claims_import_template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Import Claims from CSV</CardTitle>
          <CardDescription>
            Upload a CSV file from your previous system to bulk import claims
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Template Download */}
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Download Template</p>
                <p className="text-sm text-muted-foreground">
                  Get a sample CSV file with the correct format
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="csv-file">Upload CSV File</Label>
            <div className="flex items-center gap-4">
              <input
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => document.getElementById("csv-file")?.click()}
                disabled={importing}
              >
                <Upload className="h-4 w-4 mr-2" />
                {file ? "Change File" : "Select File"}
              </Button>
              {file && (
                <span className="text-sm text-muted-foreground">
                  {file.name} ({csvData.length} records)
                </span>
              )}
            </div>
          </div>

          {/* Field Mapping */}
          {headers.length > 0 && (
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Map Your Columns</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Match your CSV columns to the database fields. Required fields are marked with *
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(FIELD_MAPPINGS).map(([dbField, label]) => (
                  <div key={dbField} className="space-y-2">
                    <Label htmlFor={dbField}>
                      {label}
                      {(dbField === "claim_number" || dbField === "policyholder_name") && (
                        <span className="text-destructive ml-1">*</span>
                      )}
                    </Label>
                    <Select
                      value={fieldMapping[dbField] || ""}
                      onValueChange={(value) =>
                        setFieldMapping({ ...fieldMapping, [dbField]: value })
                      }
                    >
                      <SelectTrigger id={dbField}>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Skip this field</SelectItem>
                        {headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Import Progress */}
          {importing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Importing claims...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {/* Import Results */}
          {importResult && (
            <Alert variant={importResult.failed > 0 ? "destructive" : "default"}>
              {importResult.failed > 0 ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <AlertTitle>Import Complete</AlertTitle>
              <AlertDescription>
                <div className="space-y-2 mt-2">
                  <p>
                    Successfully imported: <strong>{importResult.success}</strong> claims
                  </p>
                  {importResult.failed > 0 && (
                    <div>
                      <p className="mb-2">
                        Failed: <strong>{importResult.failed}</strong> claims
                      </p>
                      <details className="text-sm">
                        <summary className="cursor-pointer font-medium">
                          View errors
                        </summary>
                        <ul className="mt-2 space-y-1 list-disc list-inside">
                          {importResult.errors.slice(0, 10).map((error, i) => (
                            <li key={i}>{error}</li>
                          ))}
                          {importResult.errors.length > 10 && (
                            <li>... and {importResult.errors.length - 10} more errors</li>
                          )}
                        </ul>
                      </details>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Import Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleImport}
              disabled={csvData.length === 0 || importing || !fieldMapping.claim_number}
            >
              {importing ? "Importing..." : `Import ${csvData.length} Claims`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Import Tips */}
      <Card>
        <CardHeader>
          <CardTitle>Import Tips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <strong>Required Fields:</strong> Claim Number and Policyholder Name are required for every claim.
          </div>
          <div>
            <strong>Date Format:</strong> Use YYYY-MM-DD format for dates (e.g., 2025-01-15).
          </div>
          <div>
            <strong>Amounts:</strong> Currency values should be numbers without currency symbols (e.g., 25000 instead of $25,000).
          </div>
          <div>
            <strong>Duplicate Claims:</strong> If a claim number already exists, the import will fail for that row.
          </div>
          <div>
            <strong>Large Imports:</strong> For files with more than 1000 records, consider breaking them into smaller batches.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
