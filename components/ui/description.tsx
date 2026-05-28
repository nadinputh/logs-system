import * as React from "react"
import { Description as HeroDescription } from "@heroui/react"

function Description(props: React.ComponentProps<typeof HeroDescription>) {
  return <HeroDescription {...props} />
}

export { Description }