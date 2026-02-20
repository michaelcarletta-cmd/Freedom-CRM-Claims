import { renderDocxToPdf as renderWithLibreOffice } from "./libreoffice.js";
import { renderHtmlToPdf } from "./html-chromium.js";

const backend = (process.env.PDF_RENDERER_BACKEND || "libreoffice").toLowerCase();

export async function renderDocxToPdf(docxBuffer) {
  switch (backend) {
    case "libreoffice":
      return await renderWithLibreOffice(docxBuffer);
    default:
      throw new Error(`Unsupported PDF_RENDERER_BACKEND for DOCX conversion: ${backend}`);
  }
}

export async function renderHtml(html) {
  switch (backend) {
    case "chromium":
      return await renderHtmlToPdf(html);
    default:
      throw new Error(`Unsupported PDF_RENDERER_BACKEND for HTML conversion: ${backend}`);
  }
}
