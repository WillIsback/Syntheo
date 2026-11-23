import { forwardRef } from "react";

import { cn } from "@syntheo/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "outline-solid" | "ghost";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn([
        "rounded-lg",
        variant === "default" && "bg-background border shadow-xs",
        variant === "outline-solid" && "border",
        variant === "ghost" && "border-none shadow-none",
        className,
      ])}
      {...props}
    />
  ),
);
Card.displayName = "Card";

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  spacing?: "default" | "compact" | "loose";
}

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, spacing = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn([
        spacing === "default" && "p-6 pt-0",
        spacing === "compact" && "p-4 pt-0",
        spacing === "loose" && "p-8 pt-0",
        className,
      ])}
      {...props}
    />
  ),
);
CardContent.displayName = "CardContent";
