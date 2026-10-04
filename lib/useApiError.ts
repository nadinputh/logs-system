"use client";

import { useTranslations } from "next-intl";
import { translateApiError } from "@/lib/apiError";

/** Usage: `const apiError = useApiError()`, then `apiError(payload, fallbackMessage)`. */
export function useApiError() {
  const t = useTranslations("apiErrors");
  return (payload: any, fallback: string) =>
    translateApiError(t as any, payload, fallback);
}
