import { makerspaceDesignData } from "./makerspaceTextOverlays.generated";

export function MakerspaceConvertedPage({ page, className = "", imageClassName = "", textClassName = "", alt = "" }) {
  const data = makerspaceDesignData.pages[page];

  if (!data) {
    return null;
  }

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
        dangerouslySetInnerHTML={{ __html: data.markup }}
      />
    </div>
  );
}
