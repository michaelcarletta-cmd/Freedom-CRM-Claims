import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Maximum file size: 20MB (matches upload limit)
const MAX_FILE_SIZE = 20 * 1024 * 1024;
// Maximum size for PDF/document base64 encoding (edge function memory limit)
const MAX_PDF_SIZE = 8 * 1024 * 1024; // 8MB limit for PDFs

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

// Get mime type from file type
function getMimeType(fileType: string, fileName: string): string {
  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    return 'application/pdf';
  }
  if (fileType.includes('word') || fileName.match(/\.docx?$/i)) {
    return fileType.includes('docx') 
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      : 'application/msword';
  }
  if (fileType.includes('powerpoint') || fileType.includes('presentation') || fileName.match(/\.pptx?$/i)) {
    return fileName.match(/\.pptx$/i) 
      ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' 
      : 'application/vnd.ms-powerpoint';
  }
  if (fileType.includes('video') || fileName.match(/\.(mp4|mov|avi|mkv|webm)$/i)) {
    return 'video/mp4';
  }
  if (fileType.includes('audio') || fileName.match(/\.(mp3|wav|m4a)$/i)) {
    return 'audio/mpeg';
  }
  // Image types
  if (fileType.includes('image') || fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp|heic)$/i)) {
    if (fileName.match(/\.png$/i)) return 'image/png';
    if (fileName.match(/\.gif$/i)) return 'image/gif';
    if (fileName.match(/\.webp$/i)) return 'image/webp';
    if (fileName.match(/\.bmp$/i)) return 'image/bmp';
    return 'image/jpeg';
  }
  return fileType || 'application/octet-stream';
}

// Download and convert to base64 data URL
// NOTE: The AI gateway only supports direct URLs for images (PNG, JPEG, WebP, GIF)
// PDFs, documents, and other formats MUST be sent as base64 data URLs

function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/') && 
    ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(mimeType);
}

async function downloadAndEncodeFile(fileUrl: string, mimeType: string, fileSize: number | null): Promise<{ url: string; isDirectUrl: boolean }> {
  // Check file size before processing
  if (fileSize && fileSize > MAX_FILE_SIZE) {
    throw new Error(`File too large (${Math.round(fileSize / 1024 / 1024)}MB). Maximum supported size is 20MB. Please upload a smaller file.`);
  }
  
  // Only images can use direct URLs - PDFs and documents MUST be base64 encoded
  const canUseDirectUrl = isImageMimeType(mimeType);
  
  // For PDFs and documents, check against the stricter size limit
  if (!canUseDirectUrl && fileSize && fileSize > MAX_PDF_SIZE) {
    throw new Error(`PDF/document too large (${Math.round(fileSize / 1024 / 1024)}MB). Maximum supported size for documents is 8MB due to processing limits. Please compress or split the file.`);
  }
  
  if (canUseDirectUrl && fileSize && fileSize > 10 * 1024 * 1024) {
    // Only use direct URL for large images
    console.log(`Large image (${Math.round(fileSize / 1024 / 1024)}MB), using direct URL`);
    return { url: fileUrl, isDirectUrl: true };
  }
  
  console.log(`Downloading file for base64 encoding (${Math.round((fileSize || 0) / 1024 / 1024)}MB)...`);
  
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const base64 = base64Encode(arrayBuffer);
  
  console.log(`Encoded file: ${arrayBuffer.byteLength} bytes as base64`);
  
  return { url: `data:${mimeType};base64,${base64}`, isDirectUrl: false };
}

// Extract text from document using base64 data
async function extractTextFromDocument(dataUrl: string, fileName: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  console.log(`Extracting text from document: ${fileName}`);

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
    
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again in a few minutes.');
    }
    if (response.status === 402) {
      throw new Error('AI credits exhausted. Please add funds to continue processing.');
    }
    
    throw new Error(`Failed to extract document text: ${response.status}`);
  }

  const data = await response.json();
  const extractedText = data.choices?.[0]?.message?.content || '';
  console.log(`Extracted ${extractedText.length} characters`);
  return extractedText;
}

// Analyze image content using AI
async function analyzeImage(dataUrl: string, fileName: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  console.log(`Analyzing image: ${fileName}`);

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
              text: `Please analyze this image thoroughly and provide a detailed description. Include:
1. Any visible text (OCR if present)
2. What type of document or photo this appears to be
3. Key visual elements, objects, or subjects shown
4. Any relevant details that would be useful for insurance claims (damage assessment, property conditions, etc.)
5. If this is a document, extract all readable content

Provide your analysis in a clear, structured format that can be used as a knowledge reference.`
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
    console.error('Image analysis error:', errorText);
    
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again in a few minutes.');
    }
    if (response.status === 402) {
      throw new Error('AI credits exhausted. Please add funds to continue processing.');
    }
    
    throw new Error(`Failed to analyze image: ${response.status}`);
  }

  const data = await response.json();
  const analysisText = data.choices?.[0]?.message?.content || '';
  console.log(`Analyzed image, got ${analysisText.length} characters`);
  return `[Image: ${fileName}]\n\n${analysisText}`;
}

// Extract text from PowerPoint files (PPTX is a ZIP containing XML)
async function extractTextFromPowerPoint(fileUrl: string, fileName: string): Promise<string> {
  console.log(`Extracting text from PowerPoint: ${fileName}`);
  
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download PowerPoint file: ${response.status}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  const textParts: string[] = [];
  
  // Extract text from slide XML files
  const slideFiles = Object.keys(zip.files)
    .filter(name => name.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0');
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0');
      return numA - numB;
    });
  
  for (const slidePath of slideFiles) {
    const slideNum = slidePath.match(/slide(\d+)/)?.[1] || '?';
    const content = await zip.files[slidePath].async('string');
    
    // Extract text from XML tags like <a:t>text</a:t>
    const textMatches = content.match(/<a:t>([^<]*)<\/a:t>/g) || [];
    const slideText = textMatches
      .map(match => match.replace(/<\/?a:t>/g, '').trim())
      .filter(text => text.length > 0)
      .join(' ');
    
    if (slideText) {
      textParts.push(`[Slide ${slideNum}]\n${slideText}`);
    }
  }
  
  // Also extract from notes if present
  const notesFiles = Object.keys(zip.files)
    .filter(name => name.match(/^ppt\/notesSlides\/notesSlide\d+\.xml$/));
  
  for (const notePath of notesFiles) {
    const slideNum = notePath.match(/notesSlide(\d+)/)?.[1] || '?';
    const content = await zip.files[notePath].async('string');
    
    const textMatches = content.match(/<a:t>([^<]*)<\/a:t>/g) || [];
    const noteText = textMatches
      .map(match => match.replace(/<\/?a:t>/g, '').trim())
      .filter(text => text.length > 0)
      .join(' ');
    
    if (noteText) {
      textParts.push(`[Slide ${slideNum} Notes]\n${noteText}`);
    }
  }
  
  const extractedText = textParts.join('\n\n');
  console.log(`Extracted ${extractedText.length} characters from PowerPoint`);
  
  if (!extractedText || extractedText.trim().length === 0) {
    throw new Error('No text content found in PowerPoint file');
  }
  
  return extractedText;
}

// Transcribe audio/video using base64 data
async function transcribeMedia(dataUrl: string, fileName: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  console.log(`Transcribing media: ${fileName}`);

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
    
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again in a few minutes.');
    }
    if (response.status === 402) {
      throw new Error('AI credits exhausted. Please add funds to continue processing.');
    }
    
    throw new Error(`Failed to transcribe media: ${response.status}`);
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

    // Check file size before processing
    if (document.file_size && document.file_size > MAX_FILE_SIZE) {
      const errorMsg = `File too large (${Math.round(document.file_size / 1024 / 1024)}MB). Maximum supported size is 20MB. Please upload a smaller file.`;
      await supabase
        .from('ai_knowledge_documents')
        .update({ status: 'failed', error_message: errorMsg })
        .eq('id', documentId);
      
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update status to processing
    await supabase
      .from('ai_knowledge_documents')
      .update({ status: 'processing' })
      .eq('id', documentId);

    // Get signed URL for the file (1 hour validity)
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('ai-knowledge-base')
      .createSignedUrl(document.file_path, 3600);

    if (urlError || !signedUrlData?.signedUrl) {
      throw new Error('Failed to get signed URL for document');
    }

    const fileUrl = signedUrlData.signedUrl;
    const fileType = document.file_type.toLowerCase();
    const mimeType = getMimeType(fileType, document.file_name);

    console.log(`Processing document: ${document.file_name}, type: ${fileType}, size: ${document.file_size || 'unknown'}`);

    // Get file URL (base64 data URL for small files, signed URL for large files)
    const fileData = await downloadAndEncodeFile(fileUrl, mimeType, document.file_size);
    const imageUrl = fileData.url;

    let extractedText = '';

    // Process based on file type - ORDER MATTERS!
    // PowerPoint must be checked before Word docs since both contain "document" in MIME type
    if (fileType === 'application/pdf' || document.file_name.endsWith('.pdf')) {
      extractedText = await extractTextFromDocument(imageUrl, document.file_name);
    } else if (
      fileType.includes('video') || 
      fileType.includes('audio') ||
      document.file_name.match(/\.(mp4|mov|avi|mkv|mp3|wav|m4a|webm)$/i)
    ) {
      extractedText = await transcribeMedia(imageUrl, document.file_name);
    } else if (
      fileType.includes('powerpoint') || 
      fileType.includes('presentation') ||
      document.file_name.match(/\.(pptx|ppt)$/i)
    ) {
      // PowerPoint files need direct XML extraction, not AI processing
      extractedText = await extractTextFromPowerPoint(fileUrl, document.file_name);
    } else if (
      fileType.includes('word') || 
      fileType.includes('wordprocessingml') ||
      document.file_name.match(/\.(docx|doc)$/i)
    ) {
      extractedText = await extractTextFromDocument(imageUrl, document.file_name);
    } else if (
      fileType.includes('image') ||
      document.file_name.match(/\.(jpg|jpeg|png|gif|webp|bmp|heic)$/i)
    ) {
      extractedText = await analyzeImage(imageUrl, document.file_name);
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
