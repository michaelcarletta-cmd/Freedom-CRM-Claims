import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Split text into chunks for RAG
function splitIntoChunks(text: string, chunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start < 0) start = 0;
    if (end === text.length) break;
  }
  
  return chunks;
}

// Download file and convert to base64
async function downloadFileAsBase64(fileUrl: string): Promise<{ base64: string; mimeType: string }> {
  console.log('Downloading file from URL...');
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  // Convert to base64
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  const base64 = btoa(binary);
  
  const mimeType = response.headers.get('content-type') || 'application/octet-stream';
  console.log(`Downloaded file: ${uint8Array.length} bytes, mime: ${mimeType}`);
  
  return { base64, mimeType };
}

// Extract text from PDF using Lovable AI with base64 data
async function extractTextFromDocument(base64Data: string, mimeType: string, fileName: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  console.log(`Extracting text from document: ${fileName} (${mimeType})`);

  // Determine the correct mime type for the AI
  let aiMimeType = mimeType;
  if (fileName.endsWith('.pdf') || mimeType.includes('pdf')) {
    aiMimeType = 'application/pdf';
  } else if (fileName.match(/\.docx?$/i) || mimeType.includes('word') || mimeType.includes('document')) {
    // For Word docs, we'll try as-is but may need different handling
    aiMimeType = mimeType;
  }

  const dataUrl = `data:${aiMimeType};base64,${base64Data}`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please extract all the text content from this document. Return only the extracted text, preserving the structure and formatting as much as possible. Include all headings, paragraphs, lists, and tables. Do not add any commentary or analysis.'
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl }
            }
          ]
        }
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Document extraction error:', errorText);
    throw new Error(`Failed to extract document text: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const extractedText = data.choices?.[0]?.message?.content || '';
  console.log(`Extracted ${extractedText.length} characters`);
  return extractedText;
}

// Transcribe audio/video using Lovable AI with base64 data
async function transcribeMedia(base64Data: string, mimeType: string, fileName: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  console.log(`Transcribing media: ${fileName} (${mimeType})`);

  const dataUrl = `data:${mimeType};base64,${base64Data}`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Please transcribe all the spoken content from this audio/video file. Return only the transcription text, preserving natural paragraph breaks where appropriate. Do not add any commentary or analysis.'
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl }
            }
          ]
        }
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Transcription error:', errorText);
    throw new Error(`Failed to transcribe media: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const transcribedText = data.choices?.[0]?.message?.content || '';
  console.log(`Transcribed ${transcribedText.length} characters`);
  return transcribedText;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Store documentId early for error handling
  let documentId: string | null = null;

  try {
    const body = await req.json();
    documentId = body.documentId;
    
    if (!documentId) {
      return new Response(JSON.stringify({ error: 'documentId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get document info
    const { data: document, error: docError } = await supabase
      .from('ai_knowledge_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      console.error('Document not found:', docError);
      return new Response(JSON.stringify({ error: 'Document not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update status to processing
    await supabase
      .from('ai_knowledge_documents')
      .update({ status: 'processing' })
      .eq('id', documentId);

    // Get signed URL for the file
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('ai-knowledge-base')
      .createSignedUrl(document.file_path, 3600);

    if (urlError || !signedUrlData?.signedUrl) {
      throw new Error('Failed to get signed URL for document');
    }

    const fileUrl = signedUrlData.signedUrl;
    const fileType = document.file_type.toLowerCase();

    console.log(`Processing document: ${document.file_name}, type: ${fileType}`);

    // Download file and convert to base64
    const { base64, mimeType } = await downloadFileAsBase64(fileUrl);
    
    let extractedText = '';

    // Process based on file type
    if (fileType === 'application/pdf' || document.file_name.endsWith('.pdf')) {
      extractedText = await extractTextFromDocument(base64, 'application/pdf', document.file_name);
    } else if (
      fileType.includes('video') || 
      fileType.includes('audio') ||
      document.file_name.match(/\.(mp4|mov|avi|mkv|mp3|wav|m4a|webm)$/i)
    ) {
      extractedText = await transcribeMedia(base64, mimeType, document.file_name);
    } else if (
      fileType.includes('word') || 
      fileType.includes('document') ||
      document.file_name.match(/\.(docx|doc)$/i)
    ) {
      extractedText = await extractTextFromDocument(base64, mimeType, document.file_name);
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text could be extracted from the document');
    }

    console.log(`Extracted ${extractedText.length} characters from ${document.file_name}`);

    // Split into chunks
    const chunks = splitIntoChunks(extractedText);
    console.log(`Split into ${chunks.length} chunks`);

    // Delete any existing chunks for this document
    await supabase
      .from('ai_knowledge_chunks')
      .delete()
      .eq('document_id', documentId);

    // Insert new chunks
    const chunkInserts = chunks.map((content, index) => ({
      document_id: documentId,
      content,
      chunk_index: index,
      metadata: {
        category: document.category,
        file_name: document.file_name,
        total_chunks: chunks.length,
      },
    }));

    const { error: insertError } = await supabase
      .from('ai_knowledge_chunks')
      .insert(chunkInserts);

    if (insertError) {
      throw new Error(`Failed to insert chunks: ${insertError.message}`);
    }

    // Update document status to completed
    await supabase
      .from('ai_knowledge_documents')
      .update({ status: 'completed' })
      .eq('id', documentId);

    console.log(`Successfully processed document: ${document.file_name}`);

    return new Response(JSON.stringify({ 
      success: true, 
      chunks: chunks.length,
      characters: extractedText.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error processing document:', errorMessage);
    
    // Try to update document status to failed
    if (documentId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        await supabase
          .from('ai_knowledge_documents')
          .update({ 
            status: 'failed',
            error_message: errorMessage 
          })
          .eq('id', documentId);
      } catch (e) {
        console.error('Failed to update document status:', e);
      }
    }

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
