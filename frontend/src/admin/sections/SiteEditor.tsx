import { useState } from "react";
import { useAdmin } from "../context";
import { PageTitle, TextField } from "../ui";
import { validateSite, type Errors, type Site } from "../model";

const FIELDS: { key: keyof Site; label: string; hint?: string; type?: string }[] = [
  { key: "name", label: "Chapter name", hint: "Shown in the navbar, footer and page titles." },
  { key: "fullName", label: "Full name", hint: "Used in the footer." },
  { key: "college", label: "College" },
  { key: "city", label: "City" },
  { key: "email", label: "Contact email", type: "email", hint: "Used by the Contact page and footer." },
  { key: "linkedin", label: "LinkedIn page", type: "url" },
  { key: "instagram", label: "Instagram page", type: "url" },
  { key: "memberForm", label: "Membership form link", type: "url", hint: "The Google Form new members fill in (step 3 on the Join page). Leave empty to show an email link instead." },
  { key: "mapQuery", label: "Map location", hint: "What the Contact page map searches for." },
];

export default function SiteEditor() {
  const { content, update } = useAdmin();
  const [errors, setErrors] = useState<Errors>({});
  const site = content.site;
  return (
    <>
      <PageTitle title="Site settings">Contact details and links used across the whole site.</PageTitle>
      <div className="adm-card grid gap-5 sm:grid-cols-2">
        {FIELDS.map(f => (
          <TextField key={f.key} label={f.label} hint={f.hint} type={f.type} value={site[f.key]} error={errors[f.key]}
            className={f.key === "memberForm" ? "sm:col-span-2" : ""}
            onChange={v => { const next = { ...site, [f.key]: v }; update("site", next); setErrors(validateSite(next)); }} />
        ))}
      </div>
    </>
  );
}
