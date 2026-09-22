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
      <div className="page-header-row">
        <h1>{title}</h1>
        {children ? <div className="page-header-actions">{children}</div> : null}
      </div>
      {subtitle ? <p className="page-sub">{subtitle}</p> : null}
    </header>
  );
}
