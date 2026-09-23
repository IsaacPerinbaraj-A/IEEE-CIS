import { Fragment, type ReactNode } from "react";

/** Turns `**bold**` markers in content from src/data into <strong> text; everything else stays plain. */
export function richText(text: string): ReactNode {
  return text.split("**").map((part, i) => (i % 2 ? <strong key={i} className="font-medium text-cream">{part}</strong> : <Fragment key={i}>{part}</Fragment>));
}
