import * as React from "react"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-muted ${className ?? ""}`}
      {...props}
    />
  )
}

export { Skeleton }
