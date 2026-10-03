const fs = require("fs");
const path = require("path");

module.exports = async function validateBackend(context) {
  const root = path.join(context.packager.projectDir, "backend-dist", "MicFudiddoBackend");
  const required = ["MicFudiddoBackend.exe", "_internal/python313.dll", "_internal/base_library.zip", "_internal/_sounddevice_data/portaudio-binaries/libportaudio64bit.dll"];
  const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
  if (missing.length) throw new Error(`Backend incompleto. Execute npm run build:backend antes de empacotar. Ausentes: ${missing.join(", ")}`);
};
