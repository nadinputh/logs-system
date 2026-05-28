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
  variant?: "primary" | "secondary"
  children?: React.ReactNode
}

function Select({
  value,
  defaultValue = "",
  onValueChange,
  items,
  disabled,
  variant = "secondary",
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
  const fallbackAriaLabel = placeholder ?? "Select option"

  return (
    <HeroSelect.Root
      selectedKey={currentValue === "" ? null : currentValue}
      onSelectionChange={handleSelectionChange}
      isDisabled={disabled}
      aria-label={fallbackAriaLabel}
      variant={variant}
      fullWidth
    >
      <HeroSelect.Trigger
        id={triggerId}
        className={triggerClassName}
      >
        <HeroSelect.Value>{resolvedValueChildren}</HeroSelect.Value>
        <HeroSelect.Indicator />
      </HeroSelect.Trigger>
      <HeroSelect.Popover>
        <ListBox.Root
          selectionMode="single"
          aria-label={fallbackAriaLabel}
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
