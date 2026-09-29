import * as React from 'react';
import { cn } from '@/lib/utils';

/** Default shadcn/ui Card (ADR-021). */
export const Card = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('soft-card rounded-xl border bg-card text-card-foreground', className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.ComponentProps<'h2'>>(
  ({ className, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn('font-display text-xl leading-snug font-semibold', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.ComponentProps<'p'>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';
