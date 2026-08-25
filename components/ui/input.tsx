import * as React from "react"
import { Input as HeroUIInput, TextField } from "@heroui/react"

/**
 * Input adapter: wraps HeroUI v3 Input while preserving the app-level API.
 *
 * Naming rule — the previous version derived the field's accessible name from
 * `aria-label ?? placeholder ?? id`, and React Aria propagates a TextField's
 * `aria-label` down onto the input, where it outranks `<label for>`. Every
 * placeholder therefore became the field's name: the password input announced
 * as "••••••••" and the email input as "you@company.com" (WCAG 4.1.2, and 2.5.3
 * Label in Name, since the visible label was not part of the accessible name).
 *
 * Now the visible label wins. `aria-labelledby` points at the Label adapter's
 * derived `${id}-label`, and a placeholder is never used as a name. An explicit
 * `aria-label`/`aria-labelledby` from the caller still takes precedence.
 */
type InputProps = React.ComponentProps<"input"> & {
  variant?: "primary" | "secondary"
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, disabled, variant = "secondary", ...props }, ref) => {
    const explicitLabel = props["aria-label"]
    const explicitLabelledBy = props["aria-labelledby"]

    // A visible <Label htmlFor={id}> is this app's standard pairing, so prefer
    // it. Falling back to the id keeps unlabelled fields named with something
    // truthful rather than with their placeholder text.
    const labelledBy =
      explicitLabelledBy ?? (!explicitLabel && props.id ? `${props.id}-label` : undefined)
    const ariaLabel = explicitLabel ?? (labelledBy ? undefined : props.id ?? "Input")

    return (
      <TextField aria-label={ariaLabel} aria-labelledby={labelledBy} fullWidth>
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
