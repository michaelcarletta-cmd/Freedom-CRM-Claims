export async function renderHtmlToPdf(_html) {
  throw new Error(
    "HTML renderer not configured. Set PDF_RENDERER_BACKEND=libreoffice or implement Chromium renderer.",
  );
}
