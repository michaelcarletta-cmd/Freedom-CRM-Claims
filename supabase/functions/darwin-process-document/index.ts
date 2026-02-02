import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Document classification types
type DocumentClassification = 
  | 'estimate' 
  | 'denial' 
  | 'approval' 
  | 'rfi' 
  | 'engineering_report' 
  | 'policy' 
  | 'correspondence' 
  | 'invoice' 
  | 'photo' 
  | 'other';

interface ClassificationResult {
  classification: DocumentClassification;
  confidence: number;
  metadata: {
    date_mentioned: string | null;
    deadline_mentioned: string | null;
    amounts: Array<{ description: string; amount: number }>;
    key_phrases: string[];
    sender: 'carrier' | 'adjuster' | 'contractor' | 'policyholder' | 'unknown';
    requires_action: boolean;
    urgency: 'high' | 'medium' | 'low';
    summary: string;
    // Type-specific fields
    denial_reason?: string;
    denial_type?: 'full' | 'partial' | 'coverage' | 'causation' | 'procedure';
    estimate_type?: 'xactimate' | 'symbility' | 'contractor' | 'unknown';
    gross_rcv?: number;
    approved_amount?: number;
    payment_type?: 'initial' | 'supplement' | 'final';
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { fileId, claimId, fileName, fileContent } = await req.json();

    console.log("Darwin Document Processing starting...", { fileId, claimId, fileName });

    let file: any = null;
    let textContent = '';
    let targetClaimId = claimId;

    // If fileId provided, fetch file from database
    if (fileId) {
      const { data: fileData, error: fileError } = await supabase
        .from('claim_files')
        .select('*')
        .eq('id', fileId)
        .single();

      if (fileError || !fileData) {
        throw new Error(`File not found: ${fileId}`);
      }

      file = fileData;
      targetClaimId = file.claim_id;

      // Check if already processed
      if (file.processed_by_darwin) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'File already processed',
            classification: file.document_classification 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Use extracted text if available (from OCR)
      if (file.extracted_text) {
        textContent = file.extracted_text;
      } else {
        // Try to download and extract text from file
        const { data: fileBlob, error: downloadError } = await supabase.storage
          .from('claim-files')
          .download(file.file_path);

        if (!downloadError && fileBlob) {
          // For PDFs and text files, we can attempt to extract text
          const fileType = file.file_type || '';
          if (fileType.includes('text') || file.file_name.endsWith('.txt')) {
            textContent = await fileBlob.text();
          } else if (fileType.includes('pdf')) {
            // For PDFs, we need to extract text or mark for AI processing
            // Note: We can't easily extract PDF text without a library, so we mark it
            textContent = `[PDF Document for analysis, filename: ${file.file_name}]`;
          }
        }
      }
    } else if (fileContent) {
      // Direct content provided
      textContent = typeof fileContent === 'string' 
        ? fileContent 
        : atob(fileContent);
    }

    // If no text content, try to classify by filename patterns
    if (!textContent || textContent.length < 50) {
      const classificationFromName = classifyByFilename(fileName || file?.file_name || '');
      
      // Update file record with basic classification
      if (file) {
        await supabase
          .from('claim_files')
          .update({
            document_classification: classificationFromName,
            classification_confidence: 0.4,
            classification_metadata: { 
              method: 'filename_pattern',
              summary: `Classified as ${classificationFromName} based on filename` 
            },
            processed_by_darwin: true,
            darwin_processed_at: new Date().toISOString(),
          })
          .eq('id', fileId);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          classification: classificationFromName,
          confidence: 0.4,
          method: 'filename_pattern'
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call AI for classification
    const classificationResult = await classifyDocument(textContent, fileName || file?.file_name || '');

    // Update file record with classification
    if (file) {
      await supabase
        .from('claim_files')
        .update({
          document_classification: classificationResult.classification,
          classification_confidence: classificationResult.confidence,
          classification_metadata: classificationResult.metadata,
          processed_by_darwin: true,
          darwin_processed_at: new Date().toISOString(),
        })
        .eq('id', fileId);
    }

    // Log the classification action
    await supabase
      .from('darwin_action_log')
      .insert({
        claim_id: targetClaimId,
        action_type: 'document_classified',
        action_details: {
          file_id: fileId,
          file_name: fileName || file?.file_name,
          classification: classificationResult.classification,
          confidence: classificationResult.confidence,
          metadata: classificationResult.metadata,
        },
        was_auto_executed: true,
        result: `Classified as ${classificationResult.classification} (${Math.round(classificationResult.confidence * 100)}% confidence): ${classificationResult.metadata.summary}`,
        trigger_source: 'darwin_process_document',
      });

    // Check if claim has autonomy enabled and take actions
    const { data: automation } = await supabase
      .from('claim_automations')
      .select('*')
      .eq('claim_id', targetClaimId)
      .eq('is_enabled', true)
      .single();

    // Trigger deep analysis for key document types (high confidence only)
    if (classificationResult.confidence >= 0.8) {
      // Fire and forget - don't wait for deep analysis to complete
      triggerDeepAnalysis(
        supabase,
        targetClaimId,
        classificationResult.classification,
        fileId,
        file?.file_path
      ).catch(err => console.error('Deep analysis trigger error:', err));
    }

    // Process automation actions if enabled
    if (automation && classificationResult.confidence >= 0.8) {
      await processDocumentActions(
        supabase, 
        targetClaimId, 
        classificationResult, 
        automation,
        fileId
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        classification: classificationResult.classification,
        confidence: classificationResult.confidence,
        metadata: classificationResult.metadata,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Darwin Document Processing error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function classifyByFilename(filename: string): DocumentClassification {
  const lower = filename.toLowerCase();
  
  if (/estimate|xactimate|symbility|rcv|acv|scope/i.test(lower)) return 'estimate';
  if (/denial|denied|decline/i.test(lower)) return 'denial';
  if (/approval|approved|payment|settlement/i.test(lower)) return 'approval';
  if (/rfi|request.*info|additional.*info/i.test(lower)) return 'rfi';
  if (/engineer|structural|report/i.test(lower)) return 'engineering_report';
  if (/policy|coverage|dec.*page|declaration/i.test(lower)) return 'policy';
  if (/invoice|bill|receipt/i.test(lower)) return 'invoice';
  if (/\.(jpg|jpeg|png|gif|heic|webp)$/i.test(lower)) return 'photo';
  
  return 'correspondence';
}

async function classifyDocument(textContent: string, filename: string): Promise<ClassificationResult> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    // Fallback to filename-based classification
    return {
      classification: classifyByFilename(filename),
      confidence: 0.5,
      metadata: {
        date_mentioned: null,
        deadline_mentioned: null,
        amounts: [],
        key_phrases: [],
        sender: 'unknown',
        requires_action: false,
        urgency: 'low',
        summary: 'Classified by filename pattern (AI unavailable)',
      }
    };
  }

  const systemPrompt = `You are a document classifier for insurance claims. Analyze the document and classify it.

Return ONLY valid JSON with this structure:
{
  "classification": "estimate|denial|approval|rfi|engineering_report|policy|correspondence|invoice|photo|other",
  "confidence": 0.0-1.0,
  "metadata": {
    "date_mentioned": "YYYY-MM-DD or null",
    "deadline_mentioned": "YYYY-MM-DD or null",
    "amounts": [{"description": "...", "amount": 0.00}],
    "key_phrases": ["up to 5 key phrases"],
    "sender": "carrier|adjuster|contractor|policyholder|unknown",
    "requires_action": true/false,
    "urgency": "high|medium|low",
    "summary": "One sentence summary of the document"
  }
}

For DENIALS, also include:
- "denial_reason": Main reason given
- "denial_type": "full|partial|coverage|causation|procedure"

For ESTIMATES, also include:
- "estimate_type": "xactimate|symbility|contractor|unknown"
- "gross_rcv": Total RCV amount as number

For APPROVALS, also include:
- "approved_amount": Payment amount as number
- "payment_type": "initial|supplement|final"`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Filename: ${filename}\n\nDocument content:\n${textContent.substring(0, 15000)}` }
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const result = JSON.parse(jsonMatch[0]) as ClassificationResult;
    return result;
  } catch (error) {
    console.error('AI classification error:', error);
    // Fallback to filename-based classification
    return {
      classification: classifyByFilename(filename),
      confidence: 0.5,
      metadata: {
        date_mentioned: null,
        deadline_mentioned: null,
        amounts: [],
        key_phrases: [],
        sender: 'unknown',
        requires_action: false,
        urgency: 'low',
        summary: 'Classification fallback due to AI error',
      }
    };
  }
}

// Trigger deep analysis for key document types (denial, engineer report, estimate)
async function triggerDeepAnalysis(
  supabase: any,
  claimId: string,
  classification: DocumentClassification,
  fileId: string,
  filePath: string | undefined
) {
  // Map classification to analysis type
  const analysisMap: Record<string, string> = {
    'denial': 'denial_rebuttal',
    'engineering_report': 'engineer_report_rebuttal',
    'estimate': 'estimate_gap_analysis',
  };

  const analysisType = analysisMap[classification];
  if (!analysisType || !filePath) return; // No deep analysis for this type

  console.log(`Triggering deep analysis: ${analysisType} for file ${fileId}`);

  try {
    // Check if this file was already analyzed in the last hour (prevent duplicate analyses)
    const { data: recentAnalysis } = await supabase
      .from('darwin_analysis_results')
      .select('id')
      .eq('claim_id', claimId)
      .eq('analysis_type', analysisType)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .limit(1);

    if (recentAnalysis && recentAnalysis.length > 0) {
      console.log(`Skipping ${analysisType} - already analyzed recently`);
      return;
    }

    // Download file for analysis
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('claim-files')
      .download(filePath);

    if (downloadError || !fileBlob) {
      console.error('Could not download file for deep analysis:', downloadError);
      return;
    }

    // Convert to base64
    const arrayBuffer = await fileBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode(...chunk);
    }
    const base64 = btoa(binary);

    // Call darwin-ai-analysis
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    fetch(`${SUPABASE_URL}/functions/v1/darwin-ai-analysis`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        claimId,
        analysisType,
        pdfContent: base64,
        pdfFileName: filePath.split('/').pop(),
        additionalContext: {
          auto_triggered: true,
          source_file_id: fileId,
          trigger_reason: `Automatically analyzed upon ${classification} detection`
        }
      })
    }).catch(err => console.error('Deep analysis call failed:', err));

    // Log the auto-analysis action
    await supabase.from('darwin_action_log').insert({
      claim_id: claimId,
      action_type: 'auto_deep_analysis',
      action_details: {
        file_id: fileId,
        classification,
        analysis_type: analysisType,
      },
      was_auto_executed: true,
      result: `Automatically triggered ${analysisType} for detected ${classification}`,
      trigger_source: 'darwin_document_intelligence',
    });

    console.log(`Deep analysis ${analysisType} triggered successfully for file ${fileId}`);
  } catch (error) {
    console.error('triggerDeepAnalysis error:', error);
    // Don't throw - deep analysis failure shouldn't affect classification
  }
}

async function processDocumentActions(
  supabase: any,
  claimId: string,
  classification: ClassificationResult,
  automation: any,
  fileId: string
) {
  const isFullyAutonomous = automation.autonomy_level === 'fully_autonomous';
  // Semi-autonomous should also auto-update status (only emails to insurance need review)
  const isAutonomous = ['semi_autonomous', 'fully_autonomous'].includes(automation.autonomy_level);

  // Get claim details for email drafting
  let claim: any = null;
  if (isAutonomous) {
    const { data: claimData } = await supabase
      .from('claims')
      .select('id, claim_number, policyholder_name, policyholder_email, policyholder_phone, client_id')
      .eq('id', claimId)
      .single();
    claim = claimData;
  }

  switch (classification.classification) {
    case 'denial':
      // Always create escalation for denials (never auto-respond)
      await supabase.from('darwin_action_log').insert({
        claim_id: claimId,
        action_type: 'escalation',
        action_details: {
          reason: 'denial_detected',
          file_id: fileId,
          denial_reason: classification.metadata.denial_reason,
          denial_type: classification.metadata.denial_type,
        },
        was_auto_executed: true,
        result: `DENIAL DETECTED: ${classification.metadata.denial_reason || 'Reason not extracted'}. Requires immediate attention.`,
        trigger_source: 'darwin_document_actions',
      });

      // Create urgent task
      await supabase.from('tasks').insert({
        claim_id: claimId,
        title: 'Review Denial Letter',
        description: `A denial letter was detected. Reason: ${classification.metadata.denial_reason || 'See document'}. ${classification.metadata.deadline_mentioned ? `Deadline: ${classification.metadata.deadline_mentioned}` : ''}`,
        priority: 'high',
        due_date: classification.metadata.deadline_mentioned || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'pending',
      });

      // Update claim status if autonomous (semi or fully)
      if (isAutonomous) {
        await supabase.from('claims').update({ status: 'Denied' }).eq('id', claimId);
        
        // Draft client notification email for denials (requires review due to sensitivity)
        if (claim?.policyholder_email) {
          await draftClientUpdateEmail(supabase, claimId, claim, 'Denied', classification.metadata.summary, false);
        }
      }
      break;

    case 'estimate':
      // Create task to review estimate
      await supabase.from('tasks').insert({
        claim_id: claimId,
        title: 'Review Estimate',
        description: `New ${classification.metadata.estimate_type || ''} estimate detected. ${classification.metadata.gross_rcv ? `RCV: $${classification.metadata.gross_rcv.toLocaleString()}` : ''}`,
        priority: 'medium',
        due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'pending',
      });

      // Extract to accounting if we have amounts
      if (classification.metadata.gross_rcv && classification.metadata.gross_rcv > 0) {
        // Check for existing settlement record
        const { data: existingSettlement } = await supabase
          .from('claim_settlements')
          .select('id')
          .eq('claim_id', claimId)
          .limit(1);

        if (!existingSettlement || existingSettlement.length === 0) {
          await supabase.from('claim_settlements').insert({
            claim_id: claimId,
            estimate_amount: classification.metadata.gross_rcv,
            notes: `Auto-extracted from ${classification.metadata.estimate_type || 'estimate'} by Darwin`,
          });
        } else {
          await supabase.from('claim_settlements').update({
            estimate_amount: classification.metadata.gross_rcv,
            notes: `Updated from ${classification.metadata.estimate_type || 'estimate'} by Darwin`,
          }).eq('id', existingSettlement[0].id);
        }
      }

      // Update status if autonomous (semi or fully)
      if (isAutonomous) {
        await supabase.from('claims').update({ status: 'Estimate Received' }).eq('id', claimId);
        
        // Draft client notification email
        if (claim?.policyholder_email) {
          const estimateAmount = classification.metadata.gross_rcv 
            ? ` The estimate amount is $${classification.metadata.gross_rcv.toLocaleString()}.` 
            : '';
          await draftClientUpdateEmail(
            supabase, 
            claimId, 
            claim, 
            'Estimate Received', 
            `We have received an estimate for your claim.${estimateAmount}`,
            true // Can auto-send for estimates
          );
        }
      }
      break;

    case 'approval':
      // Create task for payment processing
      await supabase.from('tasks').insert({
        claim_id: claimId,
        title: 'Process Payment',
        description: `${classification.metadata.payment_type || 'Payment'} approval received. ${classification.metadata.approved_amount ? `Amount: $${classification.metadata.approved_amount.toLocaleString()}` : ''}`,
        priority: 'high',
        due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'pending',
      });

      // Update claim status if autonomous (semi or fully)
      if (isAutonomous) {
        await supabase.from('claims').update({ status: 'Approved' }).eq('id', claimId);
        
        // Draft client notification email for approval (good news, can auto-send)
        if (claim?.policyholder_email) {
          const approvalAmount = classification.metadata.approved_amount 
            ? ` The approved amount is $${classification.metadata.approved_amount.toLocaleString()}.` 
            : '';
          await draftClientUpdateEmail(
            supabase, 
            claimId, 
            claim, 
            'Approved', 
            `Great news! Your claim has been approved.${approvalAmount}`,
            true // Can auto-send for approvals
          );
        }
      }
      break;

    case 'rfi':
      // Create urgent task with deadline
      await supabase.from('tasks').insert({
        claim_id: claimId,
        title: 'Respond to RFI',
        description: `Request for Information received. ${classification.metadata.deadline_mentioned ? `Deadline: ${classification.metadata.deadline_mentioned}` : 'Respond promptly.'}`,
        priority: 'high',
        due_date: classification.metadata.deadline_mentioned || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'pending',
      });

      // Log as requiring action
      await supabase.from('darwin_action_log').insert({
        claim_id: claimId,
        action_type: 'escalation',
        action_details: {
          reason: 'rfi_received',
          file_id: fileId,
          deadline: classification.metadata.deadline_mentioned,
        },
        was_auto_executed: true,
        result: `RFI received. ${classification.metadata.deadline_mentioned ? `Deadline: ${classification.metadata.deadline_mentioned}` : 'Respond promptly.'}`,
        trigger_source: 'darwin_document_actions',
      });
      
      // Draft client notification email for RFI (may need info from them)
      if (isAutonomous && claim?.policyholder_email) {
        const deadlineInfo = classification.metadata.deadline_mentioned 
          ? ` The insurance company has requested a response by ${classification.metadata.deadline_mentioned}.` 
          : '';
        await draftClientUpdateEmail(
          supabase, 
          claimId, 
          claim, 
          'Information Requested', 
          `The insurance company has requested additional information for your claim.${deadlineInfo} We may need to gather some details from you.`,
          true // Can auto-send RFI notifications
        );
      }
      break;

    case 'engineering_report':
      // Create task to review engineering report
      await supabase.from('tasks').insert({
        claim_id: claimId,
        title: 'Review Engineering Report',
        description: `Engineering report uploaded. ${classification.metadata.summary}`,
        priority: 'medium',
        due_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'pending',
      });
      break;
  }
}

// Draft a client update email and queue it for sending
async function draftClientUpdateEmail(
  supabase: any,
  claimId: string,
  claim: any,
  newStatus: string,
  updateMessage: string,
  canAutoSend: boolean = false
) {
  const policyholderName = claim.policyholder_name || 'Valued Policyholder';
  const firstName = policyholderName.split(' ')[0];
  
  const emailSubject = `Claim Update: ${claim.claim_number} - ${newStatus}`;
  const emailBody = `Dear ${firstName},

We wanted to keep you informed about the status of your claim (${claim.claim_number}).

${updateMessage}

Your claim status has been updated to: ${newStatus}

If you have any questions or need additional information, please don't hesitate to reach out to us. You can also view your claim details in the client portal.

Best regards,
Freedom Claims Team`;

  // Insert pending action for the autonomous agent to process
  await supabase.from('claim_ai_pending_actions').insert({
    claim_id: claimId,
    action_type: 'email_response',
    draft_content: {
      to_email: claim.policyholder_email,
      to_name: policyholderName,
      subject: emailSubject,
      body: emailBody,
      recipient_type: 'client', // This allows auto-send in semi-autonomous mode
    },
    ai_reasoning: `Automated client notification for status change to "${newStatus}". ${canAutoSend ? 'Can be auto-sent to client.' : 'Requires review before sending.'}`,
    status: 'pending',
  });

  // Log the draft creation
  await supabase.from('darwin_action_log').insert({
    claim_id: claimId,
    action_type: 'email_drafted',
    action_details: {
      recipient: claim.policyholder_email,
      recipient_type: 'client',
      new_status: newStatus,
      can_auto_send: canAutoSend,
    },
    was_auto_executed: true,
    result: `Drafted client update email for status change to "${newStatus}" - ${canAutoSend ? 'queued for auto-send' : 'requires review'}`,
    trigger_source: 'darwin_status_notification',
  });

  console.log(`Drafted client update email for claim ${claim.claim_number} - status: ${newStatus}`);
}
