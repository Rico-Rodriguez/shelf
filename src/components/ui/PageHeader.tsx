"use client";

import { useEffect } from "react";

let currentTitle = "";

export function readPageTitle() {
  return currentTitle;
}

function publishTitle(title: string) {
  currentTitle = title;
  window.dispatchEvent(new CustomEvent("shelf-title", { detail: title }));
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}) {
  useEffect(() => {
    publishTitle(title);
    return () => publishTitle("");
  }, [title]);

  return (
    <header className="page-header">
      <div className="min-w-0 flex-1">
        <h1>{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
      </div>
      {children ? <div className="page-header-actions">{children}</div> : null}
    </header>
  );
}
