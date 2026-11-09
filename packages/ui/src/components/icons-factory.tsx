import {
  HugeiconsIcon,
  type HugeiconsIconProps,
  type IconSvgElement,
} from "@hugeicons/react";
import {
  forwardRef,
  type ForwardRefExoticComponent,
  type PropsWithoutRef,
  type RefAttributes,
} from "react";

export type IconWeight = "thin" | "light" | "regular" | "bold";

export type IconProps = Omit<
  HugeiconsIconProps,
  "icon" | "strokeWidth" | "fill"
> & {
  mirrored?: boolean;
  strokeWidth?: number;
  weight?: IconWeight;
};

export type Icon = ForwardRefExoticComponent<
  PropsWithoutRef<IconProps> & RefAttributes<SVGSVGElement>
>;

const strokeWidthByWeight: Record<IconWeight, number> = {
  thin: 1,
  light: 1.25,
  regular: 1.5,
  bold: 2,
};

export function createIcon(icon: IconSvgElement, displayName: string): Icon {
  const Component = forwardRef<SVGSVGElement, IconProps>(
    (
      { mirrored = false, strokeWidth, style, weight = "regular", ...props },
      ref,
    ) => (
      <HugeiconsIcon
        {...props}
        ref={ref}
        fill="none"
        icon={icon}
        strokeWidth={strokeWidth ?? strokeWidthByWeight[weight]}
        style={
          mirrored
            ? {
                ...style,
                transform: [style?.transform, "scaleX(-1)"]
                  .filter(Boolean)
                  .join(" "),
                transformOrigin: style?.transformOrigin ?? "center",
              }
            : style
        }
      />
    ),
  );

  Component.displayName = displayName;
  return Component;
}

export function createBrandIcon(
  path: string,
  displayName: string,
  viewBox = "0 0 24 24",
): Icon {
  const Component = forwardRef<SVGSVGElement, IconProps>(
    (
      {
        mirrored: _mirrored,
        strokeWidth: _strokeWidth,
        weight: _weight,
        size = 24,
        className,
        style,
        color = "currentColor",
        ...props
      },
      ref,
    ) => (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox={viewBox}
        fill={color}
        className={className}
        style={style}
        {...props}
      >
        <path d={path} />
      </svg>
    ),
  );

  Component.displayName = displayName;
  return Component;
}
