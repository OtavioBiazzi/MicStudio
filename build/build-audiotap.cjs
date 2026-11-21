// Compila o ajudante de captura de som por app (native/VozLabAudioTap.cs) com o compilador C# que ja vem no Windows.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const source = path.join(root, "native", "VozLabAudioTap.cs");
const outDir = path.join(root, "native-dist");
const out = path.join(outDir, "VozLabAudioTap.exe");
const windir = process.env.WINDIR || "C:\\Windows";
const candidates = [
  path.join(windir, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
  path.join(windir, "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe")
];
const csc = candidates.find((file) => fs.existsSync(file));
if (!csc) {
  console.error("csc.exe nao encontrado (.NET Framework 4). Nao da para compilar o VozLabAudioTap.");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
execFileSync(csc, ["/nologo", "/optimize", "/platform:x64", "/target:exe", `/out:${out}`, source], { stdio: "inherit" });
console.log("VozLabAudioTap compilado:", out);
