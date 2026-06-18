// components/SkillGroup.tsx
import React from "react";

type Props = {
  title: string;
  items: string[];
};

export default function SkillGroup({ title, items }: Props) {
  return (
    <div className="card h-100">
      <div className="card-body">
        <h3 className="h6 fw-bold mb-3">{title}</h3>
        <div className="d-flex flex-wrap gap-2">
          {items.map((item) => (
            <span key={item} className="badge text-bg-light border">
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}