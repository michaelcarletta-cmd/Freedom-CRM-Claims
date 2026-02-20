import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

function runLibreOffice(args, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn("soffice", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("LibreOffice conversion timed out"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(
          new Error(
            `LibreOffice exited with code ${code}. stdout=${stdout} stderr=${stderr}`,
          ),
        );
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

export async function renderDocxToPdf(docxBuffer) {
  const workDir = await mkdtemp(path.join(tmpdir(), "pdf-renderer-"));
  const docxPath = path.join(workDir, "input.docx");
  const pdfPath = path.join(workDir, "input.pdf");

  try {
    await writeFile(docxPath, docxBuffer);

    await runLibreOffice([
      "--headless",
      "--nologo",
      "--nofirststartwizard",
      "--convert-to",
      "pdf:writer_pdf_Export",
      "--outdir",
      workDir,
      docxPath,
    ]);

    return await readFile(pdfPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
