import { Linkedin, Github, Instagram, Brain, BarChart3, Eye, Cpu, Code2, Users, PenTool, CalendarDays, Megaphone, type LucideIcon } from "lucide-react";
export { Linkedin, Github, Instagram };

/** Icon for each team, keyed by the team's slug in team.json. */
export const domainIcon: Record<string, LucideIcon> = {
  "machine-learning": Brain, "data-science": BarChart3, "computer-vision": Eye, iot: Cpu, "web-development": Code2,
  management: Users, design: PenTool, "event-management": CalendarDays, "public-relations": Megaphone,
};
