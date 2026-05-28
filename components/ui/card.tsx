"use client"

import * as React from "react"
import { Card as HeroCard } from "@heroui/react"

/**
 * Card adapter: wraps HeroUI v3 Card.Root with legacy compound API.
 */
function Card({
  ...props
}: React.ComponentProps<typeof HeroCard.Root> & { size?: "default" | "sm" }) {
  return <HeroCard.Root {...props} />
}

function CardHeader(props: React.ComponentProps<typeof HeroCard.Header>) {
  return <HeroCard.Header {...props} />
}

function CardTitle(props: React.ComponentProps<typeof HeroCard.Title>) {
  return <HeroCard.Title {...props} />
}

function CardDescription(props: React.ComponentProps<typeof HeroCard.Description>) {
  return <HeroCard.Description {...props} />
}

function CardContent(props: React.ComponentProps<typeof HeroCard.Content>) {
  return <HeroCard.Content {...props} />
}

function CardFooter(props: React.ComponentProps<typeof HeroCard.Footer>) {
  return <HeroCard.Footer {...props} />
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
}
