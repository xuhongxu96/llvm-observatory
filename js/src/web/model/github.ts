// Links to the observed LLVM's sources on GitHub. Patching keeps every line number, so
// lines from the build are upstream lines.
import type { TargetInfo } from "../../core/observatory.ts";

const REPO = "https://github.com/llvm/llvm-project";

export function githubUrl(target: TargetInfo, path: string, line?: number): string {
  return `${REPO}/blob/${target.commit}/llvm/${path}${line ? `#L${line}` : ""}`;
}

export function githubCommitUrl(target: TargetInfo): string {
  return `${REPO}/commit/${target.commit}`;
}
