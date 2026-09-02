"use client"

import * as React from "react"
import { ListBox, Select as HeroSelect } from "@heroui/react"

interface SelectMarkerProps {
  className?: string
  children?: React.ReactNode
}

type SelectMarkerElementProps = SelectMarkerProps & {
  value?: string
  placeholder?: string
  id?: string
}

interface SelectProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string | null) => void
  items?: Record<string, string>
  disabled?: boolean
  required?: boolean
  variant?: "primary" | "secondary"
  // Every existing call site relies on the default (true) for vertical form
  // fields, where the trigger should span its container. Set false to size
  // the trigger from its own className instead — for a Select sitting inline
  // among other controls (e.g. a filter toolbar), not a form field.
  fullWidth?: boolean
  // For a trigger with no visible placeholder and no associated <Label for>
  // (e.g. one Select per table row, where a static label can't distinguish
  // rows). Only needed when neither of those already names the control.
  ariaLabel?: string
  children?: React.ReactNode
}

function Select({
  value,
  defaultValue = "",
  onValueChange,
  items,
  disabled,
  required,
  variant = "secondary",
  fullWidth = true,
  ariaLabel,
  children,
}: SelectProps) {
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = React.useState(defaultValue)
  const currentValue = isControlled ? value ?? "" : internalValue

  const [placeholder, setPlaceholder] = React.useState<string | undefined>(undefined)
  const [valueChildren, setValueChildren] = React.useState<React.ReactNode>(undefined)
  const [triggerId, setTriggerId] = React.useState<string | undefined>(undefined)
  const [triggerClassName, setTriggerClassName] = React.useState<string | undefined>(undefined)
  const [collectedItems, setCollectedItems] = React.useState<Array<{ value: string; label: React.ReactNode }>>([])

  React.useEffect(() => {
    const foundItems: Array<{ value: string; label: React.ReactNode }> = []
    let nextPlaceholder: string | undefined
    let nextValueChildren: React.ReactNode
    let nextTriggerId: string | undefined
    let nextTriggerClassName: string | undefined

    const walk = (node: React.ReactNode): void => {
      React.Children.forEach(node, (child) => {
        if (!React.isValidElement(child)) return
        const element = child as React.ReactElement<SelectMarkerElementProps>

        if (element.type === SelectItem) {
          foundItems.push({
            value: String(element.props.value ?? ""),
            label: element.props.children,
          })
          return
        }

        if (element.type === SelectValue) {
          nextPlaceholder = element.props.placeholder
          nextValueChildren = element.props.children
          return
        }

        if (element.type === SelectTrigger) {
          nextTriggerId = element.props.id
          nextTriggerClassName = element.props.className
        }

        if (element.props?.children) {
          walk(element.props.children)
        }
      })
    }

    walk(children)
    setCollectedItems(foundItems)
    setPlaceholder(nextPlaceholder)
    setValueChildren(nextValueChildren)
    setTriggerId(nextTriggerId)
    setTriggerClassName(nextTriggerClassName)
  }, [children])

  const effectiveItems = items
    ? Object.entries(items).map(([itemValue, label]) => ({ value: itemValue, label }))
    : collectedItems

  const handleSelectionChange = (key: React.Key | null) => {
    const next = key == null ? "" : String(key)
    if (!isControlled) {
      setInternalValue(next)
    }
    onValueChange?.(next === "" ? null : next)
  }

  const selectedItemLabel = effectiveItems.find((item) => item.value === currentValue)?.label
  const resolvedValueChildren =
    currentValue === ""
      ? (valueChildren ?? placeholder)
      : (valueChildren ?? selectedItemLabel)
  // An explicit aria-label always wins the accessible-name computation, so
  // only emit one when actually needed: an explicit ariaLabel/placeholder, or
  // — as a last resort — when there's no triggerId a <Label> could target at
  // all. Otherwise defer to aria-labelledby, the same `${htmlFor}-label` id
  // the Label adapter already derives for the Input adapter, so a real
  // associated <Label> supplies the name instead of every instance on a page
  // announcing the same generic fallback string.
  const resolvedAriaLabel = ariaLabel ?? placeholder
  const labelledBy = !resolvedAriaLabel && triggerId ? `${triggerId}-label` : undefined
  const finalAriaLabel = resolvedAriaLabel ?? (labelledBy ? undefined : "Select option")

  return (
    <HeroSelect.Root
      selectedKey={currentValue === "" ? null : currentValue}
      onSelectionChange={handleSelectionChange}
      isDisabled={disabled}
      isRequired={required}
      aria-label={finalAriaLabel}
      aria-labelledby={labelledBy}
      variant={variant}
      fullWidth={fullWidth}
    >
      <HeroSelect.Trigger
        id={triggerId}
        className={triggerClassName}
      >
        {/* A long selected label (e.g. a nested location path) must clip, not
            wrap the trigger taller than its row siblings. min-w-0 overrides
            the flex item's default min-width:auto so it can actually shrink
            below its content size and truncate. */}
        <HeroSelect.Value className="min-w-0 flex-1 truncate text-left">{resolvedValueChildren}</HeroSelect.Value>
        <HeroSelect.Indicator />
      </HeroSelect.Trigger>
      <HeroSelect.Popover>
        <ListBox.Root
          selectionMode="single"
          aria-label={finalAriaLabel ?? "Select option"}
          selectedKeys={currentValue === "" ? new Set() : new Set([currentValue])}
          onSelectionChange={(selection) => {
            if (selection === "all") {
              return
            }
            const firstKey = Array.from(selection)[0]
            handleSelectionChange(firstKey == null ? null : firstKey)
          }}
        >
          {placeholder ? (
            <ListBox.Item id="" textValue={placeholder}>{placeholder}</ListBox.Item>
          ) : null}
          {effectiveItems.map((item) => (
            <ListBox.Item key={item.value} id={item.value} textValue={typeof item.label === "string" ? item.label : item.value}>
              {item.label}
            </ListBox.Item>
          ))}
        </ListBox.Root>
      </HeroSelect.Popover>
      <div className="hidden">{children}</div>
    </HeroSelect.Root>
  )
}

function SelectValue(_props: SelectMarkerProps & { placeholder?: string }) {
  return null
}

function SelectTrigger({
  children,
}: SelectMarkerProps & {
  id?: string
}) {
  return <>{children}</>
}

function SelectContent({ children }: SelectMarkerProps) {
  return <>{children}</>
}

function SelectItem({
  children,
}: {
  value: string
  className?: string
  children?: React.ReactNode
}) {
  return <>{children}</>
}

export {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
}
