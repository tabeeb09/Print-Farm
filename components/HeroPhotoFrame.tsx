// components/HeroPhotoFrame.tsx
import React from "react";

type Props = {
  src: string;
  alt: string;
  caption?: string;
};

export default function HeroPhotoFrame({ src, alt, caption }: Props) {
  return (
    <figure className="card shadow-sm mb-0">
      <div className="ratio ratio-1x1 bg-light">
        <img
          src={src}
          alt={alt}
          className="w-100 h-100 object-fit-cover rounded-top"
          style={{ objectFit: "cover" }}
        />
      </div>
      {caption ? (
        <figcaption className="card-body py-2 px-3">
          <small className="text-muted">{caption}</small>
        </figcaption>
      ) : null}
    </figure>
  );
}