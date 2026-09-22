import { Linkedin, Github, Instagram, Brain, BarChart3, Eye, Cpu, Code2, Users, PenTool, CalendarDays, Megaphone, GraduationCap, Lightbulb, FlaskConical, Presentation, Briefcase, type LucideIcon } from "lucide-react";
import type { PillarIcon } from "../../shared/content.ts";
export { Linkedin, Github, Instagram };

/**
 * Icon for each "What We Do" item, keyed by its `icon` value in home.json. Unknown keys fall back to Lightbulb.
 * The keys must match PILLAR_ICONS in shared/content.ts (the admin's icon choices and its validation use that list).
 */
export const pillarIcon: Record<string, LucideIcon> = {
  learning: GraduationCap, innovation: Lightbulb, research: FlaskConical, collaboration: Users, events: Presentation, industry: Briefcase,
} satisfies Record<PillarIcon, LucideIcon>;

/** Icon for each team, keyed by the team's slug in team.json. */
export const domainIcon: Record<string, LucideIcon> = {
  "machine-learning": Brain, "data-science": BarChart3, "computer-vision": Eye, iot: Cpu, "web-development": Code2,
  management: Users, design: PenTool, "event-management": CalendarDays, "public-relations": Megaphone,
};
