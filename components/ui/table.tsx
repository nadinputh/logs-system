"use client"

import * as React from "react"
import { Table as HeroTable } from "@heroui/react"

type TableProps = Omit<React.ComponentProps<typeof HeroTable.Content>, "className"> &
  Pick<React.ComponentProps<typeof HeroTable.Root>, "className" | "variant"> & {
    contentClassName?: React.ComponentProps<typeof HeroTable.Content>["className"]
    scrollContainerClassName?: React.ComponentProps<typeof HeroTable.ScrollContainer>["className"]
  }

function Table({
  className,
  contentClassName,
  scrollContainerClassName,
  variant,
  "aria-label": ariaLabel = "Data table",
  ...props
}: TableProps) {
  return (
    <HeroTable.Root className={["p-2", className].filter(Boolean).join(" ")} variant={variant}>
      <HeroTable.ScrollContainer className={scrollContainerClassName}>
        <HeroTable.Content
          aria-label={ariaLabel}
          className={contentClassName}
          {...props}
        />
      </HeroTable.ScrollContainer>
    </HeroTable.Root>
  )
}

function TableHeader<T extends object>({
  className,
  ...props
}: React.ComponentProps<typeof HeroTable.Header<T>>) {
  return <HeroTable.Header {...props} className={className} />
}

function TableBody<T extends object>({
  className,
  ...props
}: React.ComponentProps<typeof HeroTable.Body<T>>) {
  return <HeroTable.Body {...props} className={className} />
}

function TableFooter({ className, ...props }: React.ComponentProps<typeof HeroTable.Footer>) {
  return <HeroTable.Footer className={className} {...props} />
}

function TableRow<T extends object>({
  className,
  ...props
}: React.ComponentProps<typeof HeroTable.Row<T>>) {
  return (
    <HeroTable.Row
      {...props}
      className={className}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<typeof HeroTable.Column>) {
  return (
    <HeroTable.Column
      className={className}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<typeof HeroTable.Cell>) {
  return <HeroTable.Cell className={className} {...props} />
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
}
