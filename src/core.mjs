export async function executeSequence({ prompts, adapter, onProgress = async () => {}, signal }) {
  const total = prompts.length;
  let completed = 0;
  const report = async (status, extra = {}) => {
    const state = { status, completed, total, ...extra };
    await onProgress(state);
    return state;
  };
  await report("running");
  try {
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) return await report("cancelled");
      await report("sending", { step: i + 1 });
      // No automatic retry: an uncertain delivery must never produce a duplicate.
      await adapter.sendAndWait(prompts[i], { index: i, signal });
      completed++;
      await report("running");
    }
    return await report("completed", { url: await adapter.url() });
  } catch (error) {
    return await report(signal?.aborted ? "cancelled" : "blocked", {
      step: completed + 1,
      error: signal?.aborted ? "Execution cancelled" : String(error?.message || error)
    });
  }
}
