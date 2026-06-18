"use client";

import PdfViewer from "./PdfViewer";

export default function CvPdfClient({ url }: { url: string }) {
  return <PdfViewer url={url} />;
}
