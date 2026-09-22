"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CashFlowRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/insights");
  }, [router]);
  return null;
}
