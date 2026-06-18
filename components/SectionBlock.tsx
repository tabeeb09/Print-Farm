// components/SectionBlock.tsx
import React from "react";

type Props = {
  title: string;
  children: React.ReactNode;
};

export default function SectionBlock({ title, children }: Props) {
  return (
    <section className="mb-5">
      <div className="d-flex align-items-center mb-3">
        <h2 className="h3 mb-0"><b>{title}</b></h2>
      </div>
      <div className="card shadow-sm">
        <div className="card-body">{children}</div>
      </div>
    </section>
  );
}