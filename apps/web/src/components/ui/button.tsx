import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-primary to-[#7B8FFF] text-primary-foreground shadow-[0_10px_24px_rgba(93,124,250,0.32)] hover:brightness-105 hover:shadow-[0_14px_30px_rgba(93,124,250,0.36)]',
        destructive:
          'bg-gradient-to-r from-destructive to-[#F26E8C] text-destructive-foreground shadow-[0_10px_24px_rgba(244,92,126,0.30)] hover:brightness-105',
        outline:
          'border border-white/75 bg-white/72 text-slate-700 shadow-[0_8px_20px_rgba(76,95,154,0.10)] hover:bg-accent/90 hover:text-accent-foreground hover:border-[#C9D4FF]',
        secondary:
          'bg-secondary text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_16px_rgba(78,99,160,0.12)] hover:bg-secondary/85',
        ghost: 'text-slate-600 hover:bg-accent/80 hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-lg px-3',
        lg: 'h-11 rounded-xl px-8',
        icon: 'h-10 w-10 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
