"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export default function PdfViewer({ url }: { url: string }) {
  const [numPages, setNumPages] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="w-full">
      {error && (
        <div style={{ padding: 12, border: "1px solid #f00", marginBottom: 12 }}>
          <div>PDF failed:</div>
          <pre style={{ whiteSpace: "pre-wrap" }}>{error}</pre>
        </div>
      )}

      <Document
        file={url}
        loading={<div>Loading PDF…</div>}
        error={<div>react-pdf error (see console + red box)</div>}
        onLoadSuccess={({ numPages }) => {
          setError(null);
          setNumPages(numPages);
        }}
        onLoadError={(e) => {
          console.error("Document onLoadError:", e);
          setError(String((e as any)?.message ?? e));
        }}
        onSourceError={(e) => {
          console.error("Document onSourceError:", e);
          setError(String((e as any)?.message ?? e));
        }}
      >
        {Array.from({ length: numPages }, (_, i) => (
          <div key={i} className="mb-6">
            <Page
              pageNumber={i + 1}
              width={900}
              // TEMP: remove SVG mode while debugging
              // renderMode="svg"
              onRenderError={(e) => {
                console.error("Page onRenderError:", e);
                setError(String((e as any)?.message ?? e));
              }}
            />
          </div>
        ))}
      </Document>
    </div>
  );
}