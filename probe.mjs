import {writeFileSync} from 'node:fs';
import {MODEL_PATHS,controllerModel,plannerModel,request} from './models.mjs';

for(const [name,path,body] of [
 ['jev',MODEL_PATHS.decisions,{model:controllerModel,state:'Minecraft survival. Health 20. A log is within reach. No tools or wood. Goal: get wood for tools.',questions:{action:{type:'choice',instructions:'Select the next player action.',criteria:{mine_log:'Break the nearby log to get wood.',wait:'Stand still.'}}}}],
 ['planner',MODEL_PATHS.chatCompletions,{model:plannerModel,messages:[{role:'user',content:'We are building a Minecraft 1.16.5 Mineflayer bot, you are the high-level planner and JEVK5 selects legal actions. Seed -4530634556500121041 has active End portal 1007 33 -1220. Survival Easy, no cheats. Give a compact viable plan to kill Ender Dragon using gathered resources. Suggest minimal gear and a robust fight strategy. No game actions yet.'}],max_tokens:2500,chat_template_kwargs:{enable_thinking:false},response_format:{type:'json_object'}}]
]){
 const result=await request(path,body);
 writeFileSync(`research/${name}-probe.json`,JSON.stringify(result.data,null,2));
 console.log(name,result.data.model||body.model,result.latencyMs);
}
