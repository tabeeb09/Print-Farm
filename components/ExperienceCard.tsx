// components/ExperienceCard.tsx
import React from "react";

type Props = {
  role: string;
  org: string;
  meta?: string;
  children: React.ReactNode;
  imageSrc?: string;
  imageAlt?: string;
  imageLink?: string;
};

export default function ExperienceCard({
  role,
  org,
  meta,
  children,
  imageSrc,
  imageAlt,
  imageLink,
}: Props) {
  return (
    <article className="card shadow-sm">
      <div className="card-body">
        <div className="d-flex flex-column flex-md-row gap-3">
          {imageSrc ? (
            <div style={{ minWidth: 220, maxWidth: 280 }} className="w-100">
              {imageLink ? (
                <a href={imageLink} target="_blank" rel="noreferrer">
                  <img
                    src={imageSrc}
                    alt={imageAlt || `${org} image`}
                    className="img-fluid rounded border"
                  />
                </a>
              ) : (
                <img
                  src={imageSrc}
                  alt={imageAlt || `${org} image`}
                  className="img-fluid rounded border"
                />
              )}
            </div>
          ) : null}

          <div className="flex-grow-1">
            <h3 className="h5 mb-1">{role}</h3>
            <div className="fw-semibold mb-1">{org}</div>
            {meta ? <div className="text-muted small mb-3">{meta}</div> : null}
            <div>{children}</div>
          </div>
        </div>
      </div>
    </article>
  );
}