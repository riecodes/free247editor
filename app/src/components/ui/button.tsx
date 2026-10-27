import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// shadcn button, sized for the mockup: every target is at least 44 px tall.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-transparent font-bold whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border-input bg-transparent font-semibold hover:bg-secondary",
        secondary: "border-input bg-secondary hover:bg-secondary/70",
        final: "bg-final-btn text-final-btn-ink hover:bg-final-btn/90",
        link: "min-h-0 px-0 font-semibold text-brand underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-11 px-4 text-[15px]",
        lg: "min-h-12 px-5 text-[15px]",
        sm: "min-h-11 px-3 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
