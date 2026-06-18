"use client";
import "bootstrap/dist/css/bootstrap.min.css";
import React from "react";

interface Props {
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  variant?: string;
  children: React.ReactNode;
  className?: string;
  rounded?: boolean;
}

export default function HeaderButton({ href, onClick, variant = "primary", children, className = "", rounded = true }: Props) {
  const base = `btn btn-${variant} ${rounded ? "rounded-rectangle" : "rounded"} py-1 px-3`;
  const cls = `${base} ${className}`.trim();
  if (href) {
    return (
      <a href={href} className={cls} role="button">
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick}>
      {children}
    </button>
  );
}
