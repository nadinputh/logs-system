import * as React from "react"
import { Button as HeroUIButton } from "@heroui/react"

type HeroUIButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "danger-soft"
  | "tertiary"

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link"
  size?: "xs" | "sm" | "default" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"
  isLoading?: boolean
  onPress?: React.ComponentProps<typeof HeroUIButton>["onPress"]
  isDisabled?: boolean
  value?: string
}

/**
 * Button adapter: wraps HeroUI v3 Button while preserving the app-level API.
 * Accepts both React button props and HeroUI press/disabled props.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      onClick,
      onPress,
      disabled,
      isDisabled,
      isLoading,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabledFinal = isDisabled ?? disabled ?? isLoading ?? false
    
    const handlePress: NonNullable<ButtonProps["onPress"]> | undefined =
      onPress || onClick
        ? ((e) => {
            onPress?.(e)
            onClick?.(e as unknown as React.MouseEvent<HTMLButtonElement>)
          })
        : undefined

    let heroUIVariant: HeroUIButtonVariant = "primary"
    
    switch (variant) {
      case "outline":
        heroUIVariant = "outline"
        break
      case "secondary":
        heroUIVariant = "secondary"
        break
      case "ghost":
        heroUIVariant = "ghost"
        break
      case "destructive":
        heroUIVariant = "danger"
        break
      case "link":
        heroUIVariant = "tertiary"
        break
      case "default":
      default:
        heroUIVariant = "primary"
    }

    const sizeMap: Record<NonNullable<ButtonProps["size"]>, "sm" | "md" | "lg"> = {
      xs: "sm",
      sm: "sm",
      default: "md",
      lg: "lg",
      icon: "md",
      "icon-xs": "sm",
      "icon-sm": "sm",
      "icon-lg": "lg",
    }
    const heroUISize = sizeMap[size] || "md"
    
    const isIconOnly = size?.includes("icon")

    return (
      <HeroUIButton
        ref={ref as any}
        variant={heroUIVariant}
        size={heroUISize}
        isDisabled={isDisabledFinal}
        isIconOnly={isIconOnly}
        onPress={handlePress}
        className={className}
        {...(props as any)}
      >
        {children}
      </HeroUIButton>
    )
  }
)

Button.displayName = "Button"

export { Button }

