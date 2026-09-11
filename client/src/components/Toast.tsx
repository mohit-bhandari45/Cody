import React from "react";

interface ToastProps {
  toast: { message: string; type: "success" | "error" } | null;
}

export const Toast: React.FC<ToastProps> = ({ toast }) => {
  if (!toast) return null;

  return (
    <div className="toast">
      [{toast.type.toUpperCase()}] {toast.message}
    </div>
  );
};
