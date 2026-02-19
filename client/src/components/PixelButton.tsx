import React from "react";

interface PixelButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "blue" | "green" | "gray";
  children: React.ReactNode;
  className?: string;
}

export const PixelButton: React.FC<PixelButtonProps> = ({
  variant = "blue",
  children,
  className = "",
  ...props
}) => {
  const variantClass =
    variant === "green"
      ? "blueprint-btn !border-green-500 !text-green-500 hover:!bg-green-500 hover:!text-blueprint-blue shadow-[0_0_10px_rgba(34,197,94,0.3)]"
      : variant === "gray"
        ? "blueprint-btn !border-gray-400 !text-gray-400 hover:!bg-gray-400 hover:!text-blueprint-blue shadow-[0_0_10px_rgba(156,163,175,0.3)]"
        : "blueprint-btn";

  return (
    <button
      className={`${variantClass} ${className} disabled:opacity-50 disabled:cursor-not-allowed`}
      disabled={props.disabled}
      {...props}
    >
      {children}
    </button>
  );
};
