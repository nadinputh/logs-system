import * as React from "react"
import { Input as HeroUIInput, TextField } from "@heroui/react"

/**
 * Input adapter: wraps HeroUI v3 Input while preserving the app-level API.
 */
type InputProps = React.ComponentProps<"input"> & {
  variant?: "primary" | "secondary"
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, disabled, variant = "secondary", ...props }, ref) => {
    const textFieldLabel =
      props["aria-label"] ??
      (typeof props.placeholder === "string" ? props.placeholder : undefined) ??
      props.id ??
      "Input"

    return (
      <TextField aria-label={textFieldLabel} fullWidth>
        <HeroUIInput
          ref={ref}
          type={type}
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

Input.displayName = "Input"

export { Input }

