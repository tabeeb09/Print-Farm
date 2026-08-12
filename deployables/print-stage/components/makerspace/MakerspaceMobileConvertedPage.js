import { makerspaceMobileDesignData } from "./makerspaceMobileDesign.generated";

export function MakerspaceMobileConvertedPage({ page, className = "", imageClassName = "", textClassName = "", alt = "" }) {
  const data = makerspaceMobileDesignData.pages[page];

  if (!data) {
    return null;
  }

  const sanitizedMarkup = `<style>
    #g14779,
    #g14779 *,
    #g14779 #g7919,
    #g14779 #g7919 * {
      display: none !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  </style>${data.markup}`;

  return (
    <div className={className} style={{ aspectRatio: `${data.width} / ${data.height}` }}>
      <img className={imageClassName} src={data.background} alt="" aria-hidden="true" draggable="false" />
      <svg
        className={textClassName}
        viewBox={data.viewBox}
        width={data.width}
        height={data.height}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden={alt ? undefined : "true"}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        dangerouslySetInnerHTML={{ __html: sanitizedMarkup }}
      />
    </div>
  );
}
