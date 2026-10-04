"use client";

import { useLocale } from "next-intl";

type DateInput = string | number | Date;

/**
 * Date formatting that follows the language the user picked in the app, not the
 * browser's. Bare `toLocaleString()` used the browser locale, so a Khmer UI on
 * an English browser showed English dates (and the reverse).
 */
export function formatDateTime(value: DateInput, locale: string) {
  return new Date(value).toLocaleString(locale);
}
export function formatDate(
  value: DateInput,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Date(value).toLocaleDateString(locale, options);
}

export function useDateFormat() {
  const locale = useLocale();
  return {
    locale,
    dateTime: (v: DateInput) => formatDateTime(v, locale),
    date: (v: DateInput, o?: Intl.DateTimeFormatOptions) => formatDate(v, locale, o),
  };
}
