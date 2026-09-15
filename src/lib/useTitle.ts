import { useEffect } from "react";
export function useTitle(title?: string) {
  useEffect(() => { document.title = title ? `${title} | IEEE CIS REC` : "IEEE CIS REC | Computational Intelligence Society, Rajalakshmi Engineering College"; }, [title]);
}
