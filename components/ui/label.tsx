"use client"

import * as React from "react"
import { Label as HeroLabel } from "@heroui/react"

function Label({ className, ...props }: React.ComponentProps<typeof HeroLabel>) {
  return <HeroLabel className={className ? `block ${className}` : "block"} {...props} />
}

export { Label }
