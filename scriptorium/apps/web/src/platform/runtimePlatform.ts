import type { ScriptoriumPlatform } from "@scriptorium/platform";
import { webScriptoriumPlatform } from "./webProviders";

export function getScriptoriumPlatform(): ScriptoriumPlatform {
  return webScriptoriumPlatform;
}
