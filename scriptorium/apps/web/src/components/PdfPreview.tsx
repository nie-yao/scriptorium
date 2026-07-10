import type { LatexCompilerProvider } from "@scriptorium/platform";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.js", import.meta.url).toString();

interface PdfPreviewProps {
  projectId: string | null;
  pdfPath: string | null;
  revision: number;
  getPdf: LatexCompilerProvider["getPdf"];
  onRefresh: () => void;
}

export function PdfPreview({ projectId, pdfPath, revision, getPdf, onRefresh }: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.1);
  const [message, setMessage] = useState("No PDF yet");

  useEffect(() => {
    let cancelled = false;
    setDocument(null);
    setPageNumber(1);

    if (!projectId || !pdfPath) {
      setMessage("Compile to preview PDF");
      return;
    }

    setMessage("Loading PDF...");
    getPdf(projectId, pdfPath)
      .then((buffer) => pdfjs.getDocument({ data: buffer }).promise)
      .then((pdf) => {
        if (!cancelled) {
          setDocument(pdf);
          setMessage("");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Unable to load PDF");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [getPdf, projectId, pdfPath, revision]);

  useEffect(() => {
    let cancelled = false;
    if (!document || !canvasRef.current) {
      return;
    }

    document.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) {
        return;
      }
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      page.render({ canvasContext: context, viewport });
    });

    return () => {
      cancelled = true;
    };
  }, [document, pageNumber, scale]);

  return (
    <div className="pdfPane">
      <div className="panelToolbar">
        <button className="iconButton" type="button" onClick={onRefresh} title="Refresh PDF">
          <RefreshCw size={16} />
        </button>
        <button
          className="iconButton"
          type="button"
          onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
          title="Previous page"
          disabled={!document || pageNumber <= 1}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="pageCounter">
          {document ? `${pageNumber} / ${document.numPages}` : "- / -"}
        </span>
        <button
          className="iconButton"
          type="button"
          onClick={() => setPageNumber((current) => Math.min(document?.numPages ?? current, current + 1))}
          title="Next page"
          disabled={!document || pageNumber >= document.numPages}
        >
          <ChevronRight size={16} />
        </button>
        <button className="iconButton" type="button" onClick={() => setScale((current) => Math.max(0.7, current - 0.1))} title="Zoom out">
          <ZoomOut size={16} />
        </button>
        <button className="iconButton" type="button" onClick={() => setScale((current) => Math.min(2.2, current + 0.1))} title="Zoom in">
          <ZoomIn size={16} />
        </button>
      </div>
      <div className="pdfCanvasWrap">{message ? <div className="emptyState">{message}</div> : <canvas ref={canvasRef} />}</div>
    </div>
  );
}
