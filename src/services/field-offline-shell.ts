async function workerReady(active: ServiceWorker | null): Promise<boolean> {
  if (!active || new URL(active.scriptURL).pathname !== "/field-sw.js") return false;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (ready: boolean) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(ready);
    };
    const timeout = setTimeout(() => finish(false), 10_000);
    channel.port1.onmessage = (event) => finish(event.data?.ready === true);
    try {
      active.postMessage("FIELD_OFFLINE_STATUS", [channel.port2]);
    } catch {
      finish(false);
    }
  });
}
function waitForWorker(worker: ServiceWorker, states: ServiceWorkerState[], timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      worker.removeEventListener("statechange", check);
      if (error) reject(error);
      else resolve();
    };
    const check = () => {
      if (states.includes(worker.state)) finish();
      else if (worker.state === "redundant")
        finish(new Error("Alle programfiler kunne ikke gemmes. Prøv igen med stabil forbindelse."));
    };
    const timeout = setTimeout(
      () => finish(new Error("Offlineklargøringen tog for lang tid. Genåbn siden med net.")),
      timeoutMs,
    );
    worker.addEventListener("statechange", check);
    check();
  });
}
export async function checkFieldOfflineShell(): Promise<boolean> {
  if (!navigator.serviceWorker) return false;
  const registration = await navigator.serviceWorker.getRegistration("/felt");
  return workerReady(registration?.active ?? null);
}
export async function prepareFieldOfflineShell(): Promise<void> {
  if (!navigator.serviceWorker || !window.isSecureContext)
    throw new Error(
      "Denne browser kan ikke åbne feltdelen uden net. Brug en opdateret browser over HTTPS.",
    );
  const registration = await navigator.serviceWorker.register("/field-sw.js", {
    scope: "/felt",
    updateViaCache: "none",
  });
  await registration.update();
  const installing = registration.installing;
  if (installing)
    await waitForWorker(installing, ["installed", "activating", "activated"], 120_000);
  const waiting = registration.waiting;
  if (waiting) {
    waiting.postMessage("FIELD_ACTIVATE_UPDATE");
    await waitForWorker(waiting, ["activated"], 15_000);
  } else if (installing && installing.state !== "activated") {
    await waitForWorker(installing, ["activated"], 15_000);
  }
  if (!(await workerReady(registration.active)))
    throw new Error("Der mangler programfiler til offlinebrug.");
}
