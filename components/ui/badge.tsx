import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-7 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 py-0.5 text-[0.74rem] font-semibold tracking-[-0.01em] whitespace-nowrap transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-white/6 text-muted-foreground",
        secondary: "bg-secondary-container text-foreground",
        muted: "bg-white/6 text-muted-foreground",
        accent: "bg-primary-dim/14 text-primary-dim",
        ai: "bg-tertiary-soft text-tertiary",
        success: "bg-success/12 text-success",
        warning: "bg-warning/12 text-warning",
        danger: "bg-danger/12 text-danger",
        destructive: "bg-danger/12 text-danger",
        outline: "border-white/12 text-foreground",
        ghost: "text-muted-foreground",
        link: "text-primary-dim underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
