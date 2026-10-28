// Pure deterministic checkpoint logic; never perform an ambiguous retry.
export function validateState(state) {
  if (!state || typeof state !== "object") throw Error("Etat absent");
  const {id,prompts,next,hop,maxHops,batchSize,confirmed} = state;
  if (!/^[a-z0-9][a-z0-9-]{3,75}$/i.test(id||"")) throw Error("Identifiant invalide");
  if (!Array.isArray(prompts)||!prompts.length||prompts.length>20||
      prompts.some(p=>typeof p!=="string"||!p.trim()||p.length>10000)) throw Error("Prompts invalides");
  for (const [k,v] of Object.entries({next,hop,maxHops,batchSize}))
    if (!Number.isSafeInteger(v)) throw Error(k+" doit etre entier");
  if (next<0||next>prompts.length||hop<0||maxHops<1||maxHops>20||hop>maxHops||batchSize<1||batchSize>10)
    throw Error("Parametres hors limites");
  if (!Array.isArray(confirmed) || confirmed.length!==next ||
      confirmed.some((x,i)=>x!==i+1)) throw Error("Preuves de progression incoherentes");
  if (hop===maxHops && next<prompts.length) throw Error("Nombre de relais epuise");
  return state;
}
export function newState(request) {
  const s = {
    id:request.id, prompts:request.prompts, next:0, hop:0,
    maxHops:request.maxHops ?? 5,
    batchSize:request.batchSize ?? 1, confirmed:[]
  };
  return validateState(s);
}
export function chunk(state) {
  validateState(state);
  return state.prompts.slice(state.next,Math.min(state.prompts.length,state.next+state.batchSize));
}
export function advance(state,verifiedSteps){
  validateState(state);
  const expected = chunk(state).length;
  if (!Number.isInteger(verifiedSteps)||verifiedSteps!==expected||!expected)
    throw Error("Reponses non integralement confirmees : arret sans reprise");
  const n=state.next+verifiedSteps;
  return validateState({...state,next:n,hop:state.hop+1,
    confirmed:[...state.confirmed,...Array.from({length:verifiedSteps},(_,i)=>state.next+i+1)]});
}
export function encode(state){validateState(state);return Buffer.from(JSON.stringify(state)).toString("base64url");}
export function decode(input){
  if (!input||input.length>160000||!/^[A-Za-z0-9_-]+$/.test(input)) throw Error("Etat encode invalide");
  return validateState(JSON.parse(Buffer.from(input,"base64url").toString("utf8")));
}
