"use client"

import * as React from "react"
import { Label as HeroLabel } from "@heroui/react"

/**
 * Label adapter.
 *
 * When given `htmlFor`, the label also takes a derived `id` (`${htmlFor}-label`)
 * so the Input adapter can point `aria-labelledby` at it. That is what makes the
 * *visible* label authoritative for the accessible name — previously the Input
 * adapter set its own `aria-label` from the placeholder, which silently
 * outranked every label on the page.
 */
function Label({
  className,
  htmlFor,
  id,
  ...props
}: React.ComponentProps<typeof HeroLabel>) {
  return (
    <HeroLabel
      htmlFor={htmlFor}
      id={id ?? (htmlFor ? `${htmlFor}-label` : undefined)}
      className={className ? `block ${className}` : "block"}
      {...props}
    />
  )
}

export { Label }
