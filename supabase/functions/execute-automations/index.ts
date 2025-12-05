import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get pending executions
    const { data: executions, error: fetchError } = await supabase
      .from('automation_executions')
      .select(`
        *,
        automation:automations(*)
      `)
      .eq('status', 'pending')
      .limit(10);

    if (fetchError) throw fetchError;

    console.log(`Processing ${executions?.length || 0} pending automations`);

    const results = [];
    for (const execution of executions || []) {
      try {
        // Update status to running
        await supabase
          .from('automation_executions')
          .update({ status: 'running' })
          .eq('id', execution.id);

        const automation = execution.automation;
        const actions = automation.actions as any[];
        const actionResults = [];

        // Execute each action
        for (const action of actions) {
          try {
            const result = await executeAction(supabase, action, execution);
            actionResults.push({ action: action.type, success: true, result });
          } catch (actionError: any) {
            console.error('Action error:', actionError);
            actionResults.push({ 
              action: action.type, 
              success: false, 
              error: actionError.message 
            });
          }
        }

        // Update execution as success
        await supabase
          .from('automation_executions')
          .update({
            status: 'success',
            result: { actions: actionResults },
            completed_at: new Date().toISOString()
          })
          .eq('id', execution.id);

        results.push({ id: execution.id, status: 'success' });
      } catch (error: any) {
        console.error('Execution error:', error);
        
        // Update execution as failed
        await supabase
          .from('automation_executions')
          .update({
            status: 'failed',
            error_message: error.message,
            completed_at: new Date().toISOString()
          })
          .eq('id', execution.id);

        results.push({ id: execution.id, status: 'failed', error: error.message });
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function executeAction(supabase: any, action: any, execution: any) {
  const { type, config } = action;

  switch (type) {
    case 'create_task':
      return await createTask(supabase, config, execution);
    
    case 'send_notification':
      return await sendNotification(supabase, config, execution);
    
    case 'update_claim':
      return await updateClaim(supabase, config, execution);
    
    case 'update_claim_status':
      return await updateClaimStatus(supabase, config, execution);
    
    case 'send_email':
      return await sendEmail(supabase, config, execution);
    
    case 'send_sms':
      return await sendSms(supabase, config, execution);
    
    case 'webhook':
      return await callWebhook(config, execution);
    
    default:
      throw new Error(`Unknown action type: ${type}`);
  }
}

async function createTask(supabase: any, config: any, execution: any) {
  const { data: claim } = await supabase
    .from('claims')
    .select('*')
    .eq('id', execution.claim_id)
    .single();

  let dueDate = null;
  if (config.due_date_offset) {
    const offset = config.due_date_offset;
    const isBusinessDays = config.due_date_type === 'business';
    
    if (isBusinessDays) {
      // Calculate business days (Mon-Fri)
      let date = new Date();
      let daysAdded = 0;
      while (daysAdded < offset) {
        date.setDate(date.getDate() + 1);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip Sunday (0) and Saturday (6)
          daysAdded++;
        }
      }
      dueDate = date.toISOString().split('T')[0];
    } else {
      // Calendar days
      dueDate = new Date(Date.now() + offset * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }
  }

  const taskData = {
    claim_id: execution.claim_id,
    title: replaceVariables(config.title || 'Automated Task', claim, execution.trigger_data),
    description: config.description ? replaceVariables(config.description, claim, execution.trigger_data) : null,
    priority: config.priority || 'medium',
    status: 'pending',
    due_date: dueDate,
  };

  const { data, error } = await supabase
    .from('tasks')
    .insert(taskData)
    .select()
    .single();

  if (error) throw error;
  console.log('Created task:', data.id);
  return data;
}

async function sendNotification(supabase: any, config: any, execution: any) {
  const { data: claim } = await supabase
    .from('claims')
    .select('*')
    .eq('id', execution.claim_id)
    .single();

  const message = replaceVariables(config.message || 'Automated notification', claim, execution.trigger_data);
  
  const { data, error } = await supabase
    .from('claim_updates')
    .insert({
      claim_id: execution.claim_id,
      content: message,
      update_type: 'automation'
    })
    .select()
    .single();

  if (error) throw error;
  console.log('Created notification:', data.id);
  return data;
}

async function sendEmail(supabase: any, config: any, execution: any) {
  // Get claim with all related data
  const { data: claim } = await supabase
    .from('claims')
    .select(`
      *,
      referrer:referrers(name, email)
    `)
    .eq('id', execution.claim_id)
    .single();

  if (!claim) throw new Error('Claim not found');

  // Determine recipient based on config
  let recipientEmail = '';
  let recipientName = '';

  switch (config.recipient_type) {
    case 'policyholder':
      recipientEmail = claim.policyholder_email;
      recipientName = claim.policyholder_name;
      break;
    case 'adjuster':
      recipientEmail = claim.adjuster_email;
      recipientName = claim.adjuster_name;
      break;
    case 'referrer':
      recipientEmail = claim.referrer?.email;
      recipientName = claim.referrer?.name;
      break;
  }

  if (!recipientEmail) {
    throw new Error(`No email found for ${config.recipient_type}`);
  }

  const subject = replaceVariables(config.subject || 'Claim Update', claim, execution.trigger_data);
  const body = replaceVariables(config.message || '', claim, execution.trigger_data);

  // Use Resend to send email
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY not configured');
  }

  // Build attachments if folders are specified
  const attachments: { filename: string; content: string }[] = [];
  
  if (config.attachment_folders && config.attachment_folders.length > 0) {
    console.log('Fetching files from folders:', config.attachment_folders);
    console.log('File name patterns:', config.file_name_patterns || 'all files');
    
    // Get folder IDs for specified folder names
    const { data: folders } = await supabase
      .from('claim_folders')
      .select('id, name')
      .eq('claim_id', execution.claim_id)
      .in('name', config.attachment_folders);
    
    if (folders && folders.length > 0) {
      const folderIds = folders.map((f: any) => f.id);
      
      // Get files from those folders
      const { data: files } = await supabase
        .from('claim_files')
        .select('file_name, file_path')
        .eq('claim_id', execution.claim_id)
        .in('folder_id', folderIds);
      
      if (files && files.length > 0) {
        // Filter files by name patterns if specified
        const patterns = config.file_name_patterns || [];
        const filteredFiles = patterns.length > 0
          ? files.filter((file: any) => 
              patterns.some((pattern: string) => 
                file.file_name.toLowerCase().includes(pattern.toLowerCase())
              )
            )
          : files;
        
        console.log(`Found ${filteredFiles.length} files matching patterns (from ${files.length} total)`);
        
        // Download each file and convert to base64
        for (const file of filteredFiles) {
          try {
            const { data: fileData, error: downloadError } = await supabase
              .storage
              .from('claim-files')
              .download(file.file_path);
            
            if (downloadError) {
              console.error(`Error downloading file ${file.file_name}:`, downloadError);
              continue;
            }
            
            // Convert to base64
            const arrayBuffer = await fileData.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            
            attachments.push({
              filename: file.file_name,
              content: base64,
            });
            
            console.log(`Attached file: ${file.file_name}`);
          } catch (fileError) {
            console.error(`Error processing file ${file.file_name}:`, fileError);
          }
        }
      }
    }
  }

  const emailPayload: any = {
    from: 'Freedom Claims <claims@freedomadj.com>',
    to: [recipientEmail],
    subject: subject,
    html: `<div style="font-family: sans-serif;">${body.replace(/\n/g, '<br>')}</div>`,
  };

  // Add attachments if any
  if (attachments.length > 0) {
    emailPayload.attachments = attachments;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send email: ${errorText}`);
  }

  // Log email to database
  await supabase.from('emails').insert({
    claim_id: execution.claim_id,
    recipient_email: recipientEmail,
    recipient_name: recipientName,
    recipient_type: config.recipient_type,
    subject: subject,
    body: body,
  });

  console.log('Sent email to:', recipientEmail, 'with', attachments.length, 'attachments');
  return { sent_to: recipientEmail, attachments_count: attachments.length };
}

async function sendSms(supabase: any, config: any, execution: any) {
  // Get claim data
  const { data: claim } = await supabase
    .from('claims')
    .select('*')
    .eq('id', execution.claim_id)
    .single();

  if (!claim) throw new Error('Claim not found');

  // Determine recipient phone
  let recipientPhone = '';

  switch (config.recipient_type) {
    case 'policyholder':
      recipientPhone = claim.policyholder_phone;
      break;
    case 'adjuster':
      recipientPhone = claim.adjuster_phone;
      break;
  }

  if (!recipientPhone) {
    throw new Error(`No phone found for ${config.recipient_type}`);
  }

  const messageBody = replaceVariables(config.message || '', claim, execution.trigger_data);

  // Use Twilio to send SMS
  const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
    throw new Error('Twilio credentials not configured');
  }

  const formData = new URLSearchParams();
  formData.append('To', recipientPhone);
  formData.append('From', twilioPhoneNumber);
  formData.append('Body', messageBody);

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send SMS: ${errorText}`);
  }

  const twilioResponse = await response.json();

  // Log SMS to database
  await supabase.from('sms_messages').insert({
    claim_id: execution.claim_id,
    to_number: recipientPhone,
    from_number: twilioPhoneNumber,
    message_body: messageBody,
    direction: 'outbound',
    status: 'sent',
    twilio_sid: twilioResponse.sid,
  });

  console.log('Sent SMS to:', recipientPhone);
  return { sent_to: recipientPhone, sid: twilioResponse.sid };
}

async function updateClaim(supabase: any, config: any, execution: any) {
  const updates: any = {};
  
  for (const [field, value] of Object.entries(config.updates || {})) {
    updates[field] = value;
  }

  const { data, error } = await supabase
    .from('claims')
    .update(updates)
    .eq('id', execution.claim_id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateClaimStatus(supabase: any, config: any, execution: any) {
  if (!config.new_status) {
    throw new Error('No status specified for update_claim_status action');
  }

  const { data, error } = await supabase
    .from('claims')
    .update({ status: config.new_status })
    .eq('id', execution.claim_id)
    .select()
    .single();

  if (error) throw error;
  console.log('Updated claim status to:', config.new_status);
  return { new_status: config.new_status, claim_id: execution.claim_id };
}

async function callWebhook(config: any, execution: any) {
  const response = await fetch(config.url, {
    method: config.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.headers || {})
    },
    body: JSON.stringify({
      execution_id: execution.id,
      claim_id: execution.claim_id,
      trigger_data: execution.trigger_data,
      automation_id: execution.automation_id
    })
  });

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
  }

  return { status: response.status, statusText: response.statusText };
}

function replaceVariables(template: string, claim: any, triggerData: any): string {
  let result = template;
  
  // Replace claim variables
  if (claim) {
    result = result.replace(/\{claim\.(\w+)\}/g, (_, field) => claim[field] || '');
  }
  
  // Replace trigger variables (including inspection data)
  if (triggerData) {
    result = result.replace(/\{trigger\.(\w+)\}/g, (_, field) => triggerData[field] || '');
    
    // Replace inspection-specific variables for inspection_scheduled triggers
    result = result.replace(/\{inspection\.date\}/g, triggerData.inspection_date || '');
    result = result.replace(/\{inspection\.time\}/g, triggerData.inspection_time || '');
    result = result.replace(/\{inspection\.type\}/g, triggerData.inspection_type || '');
    result = result.replace(/\{inspection\.inspector\}/g, triggerData.inspector_name || '');
    result = result.replace(/\{inspection\.notes\}/g, triggerData.notes || '');
  }
  
  return result;
}
