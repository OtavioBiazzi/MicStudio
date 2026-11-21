// Gera a versao no proprio PC e publica no GitHub (mais rapido que esperar o GitHub Actions).
//
// Uso: npm run release:local
//   1. compila a interface, o backend (PyInstaller), o ajudante de som e o instalador;
//   2. cria a release vX.Y.Z no GitHub (com a tag) e sobe o instalador, o portatil e o latest.yml.
// O GitHub Actions ve que a release ja tem o instalador e nao compila de novo.
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
const tag = `v${version}`;
const product = pkg.build?.productName || "VozLab";

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  return execFileSync(command, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32", ...options });
}

function output(command, args) {
  return execFileSync(command, args, { cwd: root, encoding: "utf8", shell: process.platform === "win32" }).trim();
}

const branch = output("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
const dirty = output("git", ["status", "--porcelain"]);
if (branch !== "main") throw new Error(`Faça o merge e rode na branch main (agora: ${branch}).`);
if (dirty) throw new Error("Tem alteração sem commit. Commite antes de gerar a versão.");
run("git", ["pull", "--ff-only"]);
const commit = output("git", ["rev-parse", "HEAD"]);
const existing = (() => { try { return output("gh", ["release", "view", tag, "--json", "assets", "-q", ".assets[].name"]); } catch { return null; } })();
if (existing !== null && /Setup.*\.exe/.test(existing)) throw new Error(`A ${tag} já está publicada com instalador.`);

const python = path.join(root, ".venv", "Scripts", "pyinstaller.exe");
const started = Date.now();
run("npm", ["run", "build:web"]);
run(python, ["--noconfirm", "--clean", "--onedir", "--windowed", "--collect-all", "imageio_ffmpeg", "--collect-all", "yt_dlp", "--name", "MicFudiddoBackend", "--distpath", "backend-dist", "--workpath", "build/backend", "backend_run.py"]);
run("node", ["build/build-audiotap.cjs"]);
run("npx", ["electron-builder", "--win", "--publish", "never"]);

// O latest.yml aponta para nomes com hifen (como o GitHub guarda). Copia os arquivos com esses nomes.
const dist = path.join(root, "studio-release");
const staging = fs.mkdtempSync(path.join(os.tmpdir(), "vozlab-release-"));
const files = [
  [`${product} Setup ${version}.exe`, `${product}-Setup-${version}.exe`],
  [`${product} Setup ${version}.exe.blockmap`, `${product}-Setup-${version}.exe.blockmap`],
  [`${product} ${version}.exe`, `${product}-${version}.exe`],
  ["latest.yml", "latest.yml"]
];
const assets = [];
for (const [from, to] of files) {
  const source = path.join(dist, from);
  if (!fs.existsSync(source)) throw new Error(`Não achei ${from} em studio-release.`);
  const target = path.join(staging, to);
  fs.copyFileSync(source, target);
  assets.push(target);
}
const latest = fs.readFileSync(path.join(staging, "latest.yml"), "utf8");
if (!latest.includes(`${product}-Setup-${version}.exe`)) throw new Error("O latest.yml não aponta para o instalador desta versão.");

const notes = path.join(root, "docs", "releases", `${tag}.md`);
const noteArgs = fs.existsSync(notes) ? ["--notes-file", notes] : ["--notes", `Versão ${version}`];
if (existing === null) {
  run("gh", ["release", "create", tag, "--target", commit, "--title", tag, "--latest", ...noteArgs, ...assets]);
} else {
  run("gh", ["release", "upload", tag, "--clobber", ...assets]);
  run("gh", ["release", "edit", tag, "--latest", ...noteArgs]);
}
run("git", ["fetch", "--tags"]);
fs.rmSync(staging, { recursive: true, force: true });
console.log(`\nPronto: ${tag} publicada em ${Math.round((Date.now() - started) / 1000)} s.`);
