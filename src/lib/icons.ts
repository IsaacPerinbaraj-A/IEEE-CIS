import { Linkedin, Github, Instagram, Brain, BarChart3, Eye, Cpu, Code2, Users, PenTool, CalendarDays, Megaphone, GraduationCap, Lightbulb, FlaskConical, Presentation, Briefcase, Sparkles, Bot, Cloud, ShieldCheck, CircuitBoard, Video, type LucideIcon } from "lucide-react";
import type { PillarIcon, TeamIcon } from "../../shared/content.ts";
export { Linkedin, Github, Instagram };

/**
 * Icon for each "What We Do" item, keyed by its `icon` value in home.json. Unknown keys fall back to Lightbulb.
 * The keys must match PILLAR_ICONS in shared/content.ts (the admin's icon choices and its validation use that list).
 */
export const pillarIcon: Record<string, LucideIcon> = {
  learning: GraduationCap, innovation: Lightbulb, research: FlaskConical, collaboration: Users, events: Presentation, industry: Briefcase,
} satisfies Record<PillarIcon, LucideIcon>;

/** Icon for each team, keyed by its `icon` value in team.json (TEAM_ICONS in shared/content.ts). */
export const domainIcon: Record<TeamIcon, LucideIcon> = {
  "machine-learning": Brain, "data-science": BarChart3, "computer-vision": Eye, iot: Cpu, "web-development": Code2,
  ai: Sparkles, robotics: Bot, cloud: Cloud, security: ShieldCheck, hardware: CircuitBoard, video: Video,
  management: Users, design: PenTool, "event-management": CalendarDays, "public-relations": Megaphone,
};
/** The icon a team shows on Home: its own choice, the one matching its name, or a neutral fallback. */
export const teamIcon = (group: { icon?: TeamIcon; slug: string }): LucideIcon =>
  domainIcon[group.icon ?? (group.slug as TeamIcon)] ?? Sparkles;
