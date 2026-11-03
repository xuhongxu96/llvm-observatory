// Navigation in the source panel: a breadcrumb of the places visited (a jump to a
// definition or a matcher adds one; back and the crumbs return), and the coverage shown
// everywhere along it: the visit or iteration it started from, or the whole run.
import type { CoverageScope } from "../../core/observatory.ts";

export type Level = "visit" | "iteration" | "run";

// Where the navigation started: the iteration and visit of a record, if any.
export interface Context {
  iteration?: number;
  visit?: number;
}

export interface Crumb {
  path: string | null; // null: the sources that evaluated conditions
  line: number | null;
  label: string;
  title?: string;
  alternatives?: { path: string; line: number }[]; // other definitions of the same name
}

export interface Navigation {
  context: Context;
  level: Level;
  crumbs: Crumb[];
  index: number; // the current crumb
}

export function levelsOf(context: Context): Level[] {
  const levels: Level[] = [];
  if (context.visit !== undefined) levels.push("visit");
  if (context.iteration !== undefined) levels.push("iteration");
  levels.push("run");
  return levels;
}

export function start(context: Context, crumb: Crumb): Navigation {
  return { context, level: levelsOf(context)[0], crumbs: [crumb], index: 0 };
}

// A new place after the current one; the places after it are dropped.
export function push(nav: Navigation, crumb: Crumb): Navigation {
  return { ...nav, crumbs: [...nav.crumbs.slice(0, nav.index + 1), crumb], index: nav.index + 1 };
}

// The current place, changed (e.g. another definition of the same name).
export function replace(nav: Navigation, crumb: Crumb): Navigation {
  return { ...nav, crumbs: nav.crumbs.map((c, i) => (i === nav.index ? crumb : c)) };
}

export function goTo(nav: Navigation, index: number): Navigation {
  return { ...nav, index: Math.max(0, Math.min(index, nav.crumbs.length - 1)) };
}

export function setLevel(nav: Navigation, level: Level): Navigation {
  return levelsOf(nav.context).includes(level) ? { ...nav, level } : nav;
}

export const current = (nav: Navigation): Crumb => nav.crumbs[nav.index];

export function scopeOf(nav: Navigation): CoverageScope {
  const { iteration, visit } = nav.context;
  if (nav.level === "visit") return { iteration, visit };
  if (nav.level === "iteration") return { iteration };
  return {};
}

// A crumb for a line of a source (or the list of sources).
export function placeCrumb(path: string | null, line: number | null): Crumb {
  if (path === null) return { path, line, label: "evaluated sources" };
  const file = path.slice(path.lastIndexOf("/") + 1);
  return { path, line, label: line ? `${file}:${line}` : file, title: path };
}
