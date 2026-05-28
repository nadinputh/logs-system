import * as React from "react"
import { TextArea as HeroUITextarea, TextField } from "@heroui/react"

/**
 * Textarea adapter: wraps HeroUI v3 Textarea with consistent sizing.
 */
type TextareaProps = React.ComponentProps<"textarea"> & {
  variant?: "primary" | "secondary"
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, disabled, variant = "secondary", ...props }, ref) => {
    const textFieldLabel =
      props["aria-label"] ??
      (typeof props.placeholder === "string" ? props.placeholder : undefined) ??
      props.id ??
      "Text area"

    return (
      <TextField aria-label={textFieldLabel} fullWidth>
        <HeroUITextarea
          ref={ref}
          disabled={disabled}
          variant={variant}
          fullWidth
          className={className}
          {...props}
        />
      </TextField>
    )
  }
)

Textarea.displayName = "Textarea"

export { Textarea }

