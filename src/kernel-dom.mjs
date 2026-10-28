// Browser-injected DOM-only observation. It never reads message or response text.
// Tested against ChatGPT's October 2026 semantic action controls.
export function inspectChatDom() {
  const buttons = [...document.querySelectorAll("main button")];
  const count = label => buttons.filter(button => button.getAttribute("aria-label") === label).length;
  const stop = buttons.some(button => {
    const label = button.getAttribute("aria-label") || "";
    const testid = button.getAttribute("data-testid") || "";
    const shown = !!button.getClientRects().length &&
      getComputedStyle(button).visibility !== "hidden";
    return shown && (/^(stop|arrêter|interrompre)(\b|\s)/i.test(label) ||
      /^(stop-button|composer-stop-button)$/.test(testid));
  });
  const userActions = count("Edit message");
  const assistantCopies = count("Copy");
  const assistantRegenerates = count("Regenerate response");
  const assistantRates = count("Rate response");
  const assistantCompleted = Math.min(assistantCopies, assistantRegenerates, assistantRates);
  const editor = document.querySelector('main [role="textbox"][contenteditable="true"]');
  const send = buttons.find(button => button.getAttribute("aria-label") === "Send" && !!button.getClientRects().length);
  const observer = window.__mp_dom_watch?.state;
  return {
    userActions, assistantCopies, assistantRegenerates, assistantRates, assistantCompleted,
    stop, hasEditor: !!editor && !!editor.getClientRects().length,
    editorEmpty: !!editor && !(editor.textContent || "").trim() && !editor.querySelector("img, video, [data-testid*=attachment]"),
    sendEnabled: !!send && !send.disabled,
    inConversation: /^\/c\//.test(location.pathname),
    mutationVersion: observer?.version || 0,
    mutationQuietMs: observer ? Math.floor(performance.now() - observer.lastChangeAt) : null
  };
}

export function installChatObserver() {
  if (window.__mp_dom_watch?.observer) window.__mp_dom_watch.observer.disconnect();
  const state = {version: 0, lastChangeAt: performance.now()};
  const observer = new MutationObserver(records => {
    for (const record of records) {
      const el = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      if (!el || !el.closest("main") || el.closest('[contenteditable="true"]') ||
          el.closest("form")) continue;
      state.version++;
      state.lastChangeAt = performance.now();
      break;
    }
  });
  observer.observe(document.body, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ["aria-label","hidden","disabled","data-state"]
  });
  window.__mp_dom_watch = {state, observer};
}
