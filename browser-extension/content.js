(() => {
  "use strict";
  if (window.__mpDeterministicInstalled || location.hostname !== "chatgpt.com") return;
  window.__mpDeterministicInstalled = true;

  const selectors = {
    composer: ['#prompt-textarea[contenteditable="true"]', '[data-testid="composer-input"][contenteditable="true"]', 'textarea[data-testid="composer-input"]', '#prompt-textarea'],
    send: ['[data-testid="send-button"]', 'button[aria-label="Send prompt"]', 'button[aria-label="Envoyer le message"]'],
    stop: ['[data-testid="stop-button"]', '[data-testid="composer-stop-button"]', 'button[aria-label="Stop streaming"]', 'button[aria-label="Arrêter la génération"]'],
    assistant: '[data-message-author-role="assistant"]',
    user: '[data-message-author-role="user"]'
  };
  const queryFirst = (items) => items.map(s => document.querySelector(s)).find(Boolean) || null;
  const visible = el => !!el && !!el.getClientRects().length &&
    getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none";
  const count = selector => document.querySelectorAll(selector).length;
  const isStop = () => selectors.stop.some(s => [...document.querySelectorAll(s)].some(visible));
  const composer = () => queryFirst(selectors.composer);
  const composerReady = () => visible(composer()) && !isStop();
  const tailAssistant = () => [...document.querySelectorAll(selectors.assistant)].at(-1) || null;
  const finalActions = () => {
    const parent=tailAssistant()?.closest("article") || tailAssistant()?.parentElement;
    return !!parent?.querySelector('[data-testid="copy-turn-action-button"],button[aria-label="Copy"],button[aria-label="Copier"]');
  };
  const now = () => Date.now();

  const panel = document.createElement("aside");
  panel.id = "mp-deterministe";
  panel.setAttribute("aria-label","Multi-Prompting déterministe");
  panel.style.cssText="all:initial;position:fixed;right:14px;bottom:18px;z-index:2147483647;width:min(385px,calc(100vw - 28px));box-shadow:0 8px 30px #0005;border:1px solid #8888;border-radius:14px;background:#20252c;color:#fff;font:13px system-ui,sans-serif;padding:14px;display:flex;flex-direction:column;gap:8px;max-height:72dvh;overflow-y:auto;touch-action:pan-y";
  panel.innerHTML = '<b style="font-size:16px">Multi-Prompting déterministe</b>'
    + '<small>1 prompt = 1 message ChatGPT. Aucun agent ni API de modèle.</small>'
    + '<textarea id="mp-sequence" style="height:120px;resize:vertical;padding:8px;border-radius:8px;background:#111;color:#fff;border:1px solid #888" placeholder="Prompt 1\n--- PROMPT ---\nPrompt 2"></textarea>'
    + '<div style="display:flex;gap:7px"><button id="mp-start" type="button">Démarrer</button><button id="mp-cancel" type="button" disabled>Arrêter</button><button id="mp-hide" type="button">Masquer</button></div>'
    + '<small id="mp-status" role="status">Prêt. Sépare les prompts par --- PROMPT ---.</small>';
  for (const button of panel.querySelectorAll("button")) button.style.cssText="padding:9px 10px;border-radius:8px;background:#2478c7;color:#fff;border:0;cursor:pointer";
  document.documentElement.append(panel);

  const area=panel.querySelector("#mp-sequence"), status=panel.querySelector("#mp-status");
  const start=panel.querySelector("#mp-start"), cancel=panel.querySelector("#mp-cancel");
  let abort=null, busy=false, wakeLock=null;
  async function keepScreenAwake(){
    try {
      if("wakeLock" in navigator && !document.hidden) wakeLock=await navigator.wakeLock.request("screen");
    }catch(error){say("Écran non maintenu éveillé : laisse le téléphone actif. "+String(error.message||""));}
  }
  async function releaseScreen(){
    try {await wakeLock?.release();}catch{}
    wakeLock=null;
  }
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden && busy){
      abort?.abort();
      say("Séquence interrompue : l'onglet n'est plus au premier plan. Vérifie le dernier message avant un nouvel essai.");
    }
  });

  function say(message) { status.textContent = message; }
  function readPrompts() {
    const parts=area.value.split(/^\s*---\s*PROMPT\s*---\s*$/gim).map(s => s.trim());
    if (!parts.length || parts.some(p=>!p)) throw Error("Un prompt est vide.");
    if (parts.length>50 || parts.some(p=>p.length>12000)) throw Error("Limite : 50 prompts, 12 000 caractères chacun.");
    return parts;
  }
  function onMutation(check, timeout, signal) {
    return new Promise((resolve,reject)=>{
      let done=false;
      const cleanup=()=>{done=true;observer.disconnect();clearInterval(interval);signal?.removeEventListener("abort", cancelled);};
      const passed=()=>{if(done)return;try{if(check()) {cleanup();resolve();}}catch(e){cleanup();reject(e);}};
      const cancelled=()=>{if(done)return;cleanup();reject(Error("Séquence annulée"));};
      const observer=new MutationObserver(passed);
      const interval=setInterval(passed,350);
      observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,characterData:true});
      const deadline=now()+timeout;
      const oldCheck=check;
      check=()=>{if(now()>deadline)throw Error("Délai expiré : état non confirmé ; aucune nouvelle émission.");return oldCheck();};
      signal?.addEventListener("abort",cancelled,{once:true});
      passed();
    });
  }
  function fillComposer(prompt){
    const c=composer();
    if(!visible(c))throw Error("Champ ChatGPT non disponible.");
    c.focus();
    if(c.matches("textarea,input")){
      const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")?.set;
      if(setter&&c.matches("textarea"))setter.call(c,prompt);else c.value=prompt;
      c.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:prompt}));
    }else{
      const selection=getSelection();
      selection.selectAllChildren(c);
      selection.deleteFromDocument();
      const inserted=document.execCommand("insertText",false,prompt);
      if(!inserted && !c.textContent.trim()){
        c.textContent=prompt;
        c.dispatchEvent(new InputEvent("input",{bubbles:true,inputType:"insertText",data:prompt}));
      }
    }
    const actual=c.matches("textarea,input")?c.value:c.innerText;
    if(actual.trim()!==prompt.trim())throw Error("Saisie non vérifiée : arrêt préventif.");
  }
  async function sendOnce(prompt,signal,index,total){
    if(signal.aborted)throw Error("Annulé");
    await onMutation(composerReady,30000,signal);
    const beforeUser=count(selectors.user), beforeAssistant=count(selectors.assistant);
    let sawStop=isStop(), quietSince=0, lastSignature="";
    const observed=new MutationObserver(()=>{if(isStop())sawStop=true;});
    observed.observe(document.documentElement,{childList:true,subtree:true,attributes:true,characterData:true});
    try{
      fillComposer(prompt);
      const s=queryFirst(selectors.send);
      if(!visible(s)||s.disabled)throw Error("Bouton d'envoi indisponible. Rien n'a été envoyé.");
      // Jamais réessayer un envoi incertain, pour éviter les doublons.
      s.click();
      await onMutation(()=>count(selectors.user)>beforeUser,30000,signal);
      say("Étape "+(index+1)+"/"+total+": message utilisateur confirmé ; attente de réponse…");
      await onMutation(()=>count(selectors.assistant)>beforeAssistant,60*60*1000,signal);
      const limit=now()+60*60*1000;
      while (now()<limit) {
        if(signal.aborted)throw Error("Annulé");
        if(isStop())sawStop=true;
        const tail=tailAssistant();
        // N'inspecte pas le texte des réponses ; la signature utilise des métriques du DOM uniquement.
        const signature=String(tail?.querySelectorAll("*").length||0)+":"+String(tail?.getBoundingClientRect().height||0);
        const terminal=(sawStop || finalActions()) && !isStop() && composerReady() && count(selectors.assistant)===beforeAssistant+1;
        if(!terminal || signature!==lastSignature){quietSince=0;lastSignature=signature;}
        else if(!quietSince)quietSince=now();
        if(quietSince && now()-quietSince>3500) return;
        await new Promise(resolve=>setTimeout(resolve,350));
      }
      throw Error("Réponse trop longue ou non confirmée : arrêt avant l'étape suivante.");
    } finally {observed.disconnect();}
  }
  async function run(prompts,signal){
    let completed=0;
    for (let i=0;i<prompts.length;i++){
      say("Envoi de l'étape "+(i+1)+"/"+prompts.length+"…");
      await sendOnce(prompts[i],signal,i,prompts.length);
      completed++;
      say("Confirmé : "+completed+"/"+prompts.length+".");
    }
    say("Terminé : "+completed+" réponses distinctes confirmées dans ce chat.");
  }
  start.addEventListener("click",async()=>{
    if(busy)return;
    let prompts;
    try{prompts=readPrompts();}catch(e){say(e.message);return;}
    if(!visible(composer())){say("Ouvre d'abord une discussion ChatGPT connectée.");return;}
    const controller=new AbortController();abort=controller;busy=true;
    start.disabled=true;cancel.disabled=false;area.disabled=true;
    await keepScreenAwake();
    try{await run(prompts,controller.signal);}
    catch(e){say("ARRÊT : "+e.message+" Vérifie les derniers messages avant tout nouvel essai.");}
    finally{await releaseScreen();busy=false;cancel.disabled=true;start.disabled=false;area.disabled=false;abort=null;}
  });
  cancel.addEventListener("click",()=>abort?.abort());
  panel.querySelector("#mp-hide").addEventListener("click",()=>{panel.style.display="none";
    const show=document.createElement("button");show.textContent="Multi-Prompting";
    show.style.cssText="position:fixed;bottom:18px;right:15px;z-index:2147483647;background:#2478c7;color:white;padding:10px;border:0;border-radius:9px";
    document.documentElement.append(show);
    show.addEventListener("click",()=>{panel.style.display="flex";show.remove();});
  });
})();