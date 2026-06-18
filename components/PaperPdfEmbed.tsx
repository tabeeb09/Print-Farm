"use client";

import dynamic from "next/dynamic";

const PdfViewer = dynamic(() => import("@/components/PdfViewer"), { ssr: false });

export default function PaperPdfEmbed({ url }: { url: string }) {
  return (
    <div className="paper-pdf">
      <PdfViewer url={url} />
    </div>
  );
}
