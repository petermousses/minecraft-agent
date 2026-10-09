import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const envFile=fileURLToPath(new URL('.env',import.meta.url));
if(existsSync(envFile))process.loadEnvFile(envFile);

export const MODEL_PATHS=Object.freeze({decisions:'/v1/decisions',systemone:'/v1/systemone'});
const modelPaths=new Set(Object.values(MODEL_PATHS));
export const LITELLM_BASE_URL=(process.env.LITELLM_BASE_URL||'https://api.ai.omv.mousses.xyz').replace(/\/+$/,'');
export const plannerModel=process.env.PLANNER_MODEL||'jevk5-4b-v0.3';
export const controllerModel=process.env.CONTROLLER_MODEL||'jevk5-4b-v0.3';
export const plannerName=plannerModel.split('/').at(-1);
export const controllerName=controllerModel.split('/').at(-1);

function validateModelPath(path){if(!modelPaths.has(path))throw Error(`Unsupported LiteLLM model path: ${path}`);}

export async function requestDirect(path,body){
 validateModelPath(path);
 const key=process.env.LITELLM_API_KEY;
 if(!key)throw Error('LITELLM_API_KEY is missing; set it in the environment or local .env file');
 const started=Date.now();
 const response=await fetch(LITELLM_BASE_URL+path,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
 const data=await response.json().catch(()=>({error:{message:'Response was not valid JSON'}}));
 if(!response.ok||data.error)throw new Error(`LiteLLM HTTP ${response.status}: ${data.error?.message||data.error||'Request failed'}`);
 return {data,latencyMs:Date.now()-started};
}

export async function request(path,body){
 validateModelPath(path);
 if(process.env.MODEL_RELAY){for(let attempt=0;attempt<4;attempt++){try{const response=await fetch(process.env.MODEL_RELAY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path,body}),signal:AbortSignal.timeout(125000)});const data=await response.json();if(!response.ok||data.error)throw Error(data.error||'Local model relay failed');return data;}catch(error){if(attempt===3||!(/fetch failed|timeout|timed out|ECONNRESET|socket|5\d\d/i.test(error.message)))throw error;console.error('Temporary model request failure; retry '+(attempt+1));await new Promise(r=>setTimeout(r,1000*2**attempt));}}}
 return requestDirect(path,body);
}
export function compactObservation(state){const knownSeed=state.knownSeed?{...state.knownSeed,bastionChestLoot:state.knownSeed.bastionChestLoot?.map(c=>({...c,loot:c.loot.reduce((a,i)=>({...a,[i.name]:(a[i.name]||0)+i.count}),{})}))}:undefined;return {...state,supplies:state.supplies?{...state.supplies,mobs:state.supplies.mobs?.filter(e=>e.distance<48).sort((a,b)=>a.distance-b.distance).slice(0,16),drops:state.supplies.drops?.filter(e=>!state.position||Math.hypot(e.position.x-state.position.x,e.position.y-state.position.y,e.position.z-state.position.z)<24).slice(0,16)}:undefined,knownSeed,recent:state.recent?.slice(-5).map(({action,result,position})=>({action,result,position})),hotbar:undefined,equipment:undefined,xp:undefined,record:undefined,recordReady:undefined,recordFinished:undefined,looted:undefined};}
export async function decide(state,options){
 if(!options.length)throw new Error('No available actions to decide');
 if(options.length===1){
  const selected=options[0];
  return {data:{model:'local-single-option',selected:selected.key,reason:'only one available action'},selected,body:null,model:'local-single-option',latencyMs:0};
 }
 state=compactObservation(state);
 const choices=options.map((o,i)=>({value:'a'+i,description:o.description}));
 const body={model:controllerModel,input:JSON.stringify(state),questions:[{name:'action',type:'choice',instructions:'Control the Minecraft player. Choose one available action that best advances the current planner objective. FIRST choose an offered escape action when a breath cloud threatens the player. Clouds marked safeAtCurrentHeight are vertically separated on verified ground; distance alone does not make them dangerous. Never eat or wait inside a breath cloud. After reaching safety, if health is below 16, eat available food until the food bar is full so health can regenerate. Survival has priority over item reserve targets. Prefer a boat for long water crossings. Craft one before departure, place and board it at water, then row. Dismount and recover it at land. Swim only for short approaches; use side detours when blocked. Never pathfind along the sea floor. Check current inventory; do not keep crafting or collecting after the target is met. Avoid failed actions and needless waiting. Movement and mining options include standard pathfinding, but you own the choice.',choices}]};
 const r=await request(MODEL_PATHS.decisions,body);const answer=Array.isArray(r.data.answers)?r.data.answers.find(a=>a.name==='action'):r.data.answers?.action;
 const choiceIndex=choices.findIndex(choice=>choice.value===answer?.choice);const selected=options[choiceIndex];
 if(!selected)throw new Error('Invalid JEV action');
 return {...r,selected,body,model:r.data.model||controllerModel};
}
export async function plan(state){
 state=compactObservation(state);
 const objectives={
  prepare:`Complete only the missing surveyed route kit; current deficits: ${JSON.stringify(state.kitNeeds||{})}.`,
  entry:'Reach, repair if needed, and enter the surveyed ruined portal using normal player actions.',
  nether:'Follow the surveyed Nether route and build and ignite its exit portal.',
  stronghold:'Follow the known route to the active End portal and enter it.',
  combat:'Defeat the Ender Dragon using observed combat state, cover, and safe bed placement.',
  exit:'Reach and enter the End exit portal after dragon-death evidence.',
  complete:'The dragon is defeated and the exit portal has been reached.'
 };
 const criteria={advance:objectives[state.stage]||objectives.prepare,reassess:'Recheck the current stage, known route, and inventory deficits before choosing the next objective.'};
 if((state.recent||[]).some(action=>String(action.result||'').startsWith('FAILED ')))criteria.recover='Recover safely from the most recent failed action, then resume the current stage objective.';
 if(Number(state.health)<16||Number(state.oxygen)<15)criteria.survive='Prioritize immediate health and oxygen safety before resuming stage progress.';
 const body={model:plannerModel,state,questions:{objective:{type:'choice',instructions:'Choose the single strategic objective that best fits the current Minecraft state. Respect the current stage, known route, kit deficits, and player safety. Do not invent coordinates or tasks.',criteria}}};
 const r=await request(MODEL_PATHS.systemone,body);
 const selected=r.data.answers?.objective?.choice;
 if(!Object.hasOwn(criteria,selected))throw new Error('Invalid planner objective');
 const route=state.knownSeed||{};
 const waypoint={prepare:route.village,entry:route.entryPortal,nether:route.netherRoute?.[0]||route.exitPortal,stronghold:route.activePortal}[state.stage]||null;
 const result={objective:criteria[selected],targets:state.stage==='prepare'?(state.kitNeeds||{}):{},waypoint,notes:`selected ${selected} for ${state.stage||'unknown'} stage`};
 return {result,latencyMs:r.latencyMs,model:r.data.model||plannerModel,usage:r.data.usage,id:r.data.id};
}
