import { spawnSync } from "node:child_process";
for (const [name, command, args] of [
  ["Node", "node", ["--version"]],
  ["Java", "java", ["-version"]],
  ["ADB", "adb", ["version"]],
]) {
  const r = spawnSync(command, args, { encoding: "utf8" });
  console.log(
    `${name}: ${r.status === 0 ? "OK" : "UNAVAILABLE"} ${(r.stdout || r.stderr || r.error?.message || "").split("\n")[0]}`,
  );
}
