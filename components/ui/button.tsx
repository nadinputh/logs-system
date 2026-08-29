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
  /**
   * `brand` is DESIGN.md's documented primary button — the 135deg sky→teal
   * gradient, white label, cyan Signal-glow, 48px, weight 600. It exists as a
   * named variant because four surfaces were hand-applying `.gradient-cta` and
   * a height utility to reconstruct it at each call site, which is how the
   * treatment drifted (flat fill, weight 500, 40px) on the one page nobody
   * re-checked. `default` deliberately still maps to HeroUI's flat primary so
   * the console's ~26 primary buttons are unaffected by this.
   */
  variant?: "default" | "brand" | "mono" | "outline" | "secondary" | "ghost" | "destructive" | "link"
  /**
   * `touch` is the 48px control the visitor-facing flow uses. HeroUI's base
   * `.button` is `h-10 md:h-9`, so an unsized button is 40px on a phone and
   * 36px on desktop — below Apple's 44pt and Material's 48dp, and 12px shorter
   * than the controls on `/scan`, which is the first half of the same journey.
   * It is a named size rather than a change to `default` because the console is
   * a dense desktop surface where 36px is a deliberate choice; only the
   * one-handed visitor path needs the larger target.
   */
  size?: "xs" | "sm" | "default" | "touch" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"
  isLoading?: boolean
  /**
   * What `isLoading` does to the control.
   *
   * `disable` (default) is right for a form submit: the press is irreversible,
   * so blocking a second one is worth the cost. `busy` is for a control whose
   * caller already guards re-entry and whose loading state the user must be
   * able to *read* — a disabled button is rendered at `--disabled-opacity`,
   * which drops a white label on the brand gradient to roughly 1.5:1, and the
   * `disabled` attribute blurs the element, so the person who just pressed it
   * loses both the message and their place on the page.
   */
  loadingBehavior?: "disable" | "busy"
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
      loadingBehavior = "disable",
      children,
      ...props
    },
    ref
  ) => {
    const isDisabledFinal =
      isDisabled ?? disabled ?? (isLoading === true && loadingBehavior === "disable")

    
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
      case "brand":
      case "mono":
      case "default":
      default:
        heroUIVariant = "primary"
    }

    // DESIGN.md: "The brand gradient made tactile" — Cyan-Shadow Rule (a
    // brand-bearing surface glows, it does not float on neutral grey) and the
    // Two-Weight Rule (600 for labels; 500 is off the ramp).
    const brandClasses =
      variant === "brand"
        ? "gradient-cta shadow-signal press h-12 rounded-full px-7 text-sm font-semibold text-[var(--accent-foreground)]"
        : ""

    // `mono`: a primary action that must render monochrome even where the
    // admin-mono scope can't reach it. HeroUI's Dialog portals its content to
    // document.body, outside any React-tree-scoped wrapper, so the div-scoped
    // `.admin-mono { --accent: var(--foreground) }` override in globals.css
    // never touched a dialog's own submit button — CSS custom properties only
    // inherit through the DOM. Reading --foreground/--background directly
    // instead of --accent sidesteps the whole scoping problem: those tokens
    // were never overridden in the first place, so this renders correctly
    // monochrome no matter where in the DOM it ends up.
    const monoClasses =
      variant === "mono" ? "bg-foreground text-background hover:bg-foreground/90" : ""

    const sizeMap: Record<NonNullable<ButtonProps["size"]>, "sm" | "md" | "lg"> = {
      xs: "sm",
      sm: "sm",
      default: "md",
      // `md` carries no height rule of its own, so the h-12 below lands
      // uncontested — the same mechanism `variant="brand"` already relies on.
      touch: "md",
      lg: "lg",
      icon: "md",
      "icon-xs": "sm",
      "icon-sm": "sm",
      "icon-lg": "lg",
    }
    const heroUISize = sizeMap[size] || "md"
    const touchClasses = size === "touch" ? "h-12 text-sm font-semibold" : ""
    
    const isIconOnly = size?.includes("icon")

    return (
      <HeroUIButton
        ref={ref as any}
        variant={heroUIVariant}
        size={heroUISize}
        isDisabled={isDisabledFinal}
        aria-busy={isLoading ? true : undefined}
        isIconOnly={isIconOnly}
        onPress={handlePress}
        className={[brandClasses, monoClasses, touchClasses, className].filter(Boolean).join(" ")}
        {...(props as any)}
      >
        {children}
      </HeroUIButton>
    )
  }
)

Button.displayName = "Button"

export { Button }

