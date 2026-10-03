function backendFailure(error, executable) {
  const code = error?.code || "PROCESS_EXIT";
  const missing = code === "ENOENT";
  const denied = code === "EACCES" || code === "EPERM";
  return {
    phase: "error",
    code,
    message: missing
      ? "O servidor de audio nao foi encontrado na instalacao. Reinstale o aplicativo para recuperar os arquivos ausentes. Suas configuracoes serao mantidas."
      : denied
        ? "O Windows impediu a abertura do servidor de audio. Consulte os logs e o historico de protecao antes de reinstalar."
        : "O servidor de audio encerrou ou nao conseguiu iniciar. Consulte os logs ou tente novamente.",
    detail: `${executable || "Backend"}\n${error?.message || "Processo encerrado"}`,
    repairRequired: missing,
  };
}

async function waitUntilReady(check, { timeoutMs = 30000, cancelled = () => false, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs && !cancelled()) {
    if (await check()) return !cancelled();
    if (!cancelled()) await sleep(350);
  }
  return false;
}

module.exports = { backendFailure, waitUntilReady };
