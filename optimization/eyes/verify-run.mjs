import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const [run,world=run,video='full-playthrough-banner.mp4']=process.argv.slice(2);if(!run)throw Error('Run required');
const base=spawnSync(process.execPath,['verify-run.mjs',run,world,video],{encoding:'utf8'});if(base.error)throw base.error;
const dir='runs/'+run,proof=JSON.parse(fs.readFileSync(dir+'/verification.json')),events=fs.readFileSync(dir+'/events.jsonl','utf8').trim().split('\n').map(JSON.parse),config=JSON.parse(fs.readFileSync(dir+'/run-config.json'));
const observation=events.find(e=>e.type==='portal_initial_observation'),insertions=events.filter(e=>e.type==='eye_inserted'),entered=events.find(e=>e.type==='nether_entered'),exited=events.find(e=>e.type==='nether_exited'),eyeCrafts=events.filter(e=>e.type==='eye_ingredient_crafted'&&e.name==='ender_eye'),barters=events.filter(e=>e.type==='barter_started'),blazes=events.filter(e=>e.type==='blaze_killed');
Object.assign(proof.checks,{
 plannerModelUsed:!!config.planner&&events.some(e=>e.type==='plan')&&events.filter(e=>e.type==='plan').every(e=>e.model===config.planner),
 controllerModelUsed:!!config.controller&&events.filter(e=>e.type==='decision').length>0&&events.filter(e=>e.type==='decision').every(e=>(e.model||e.request?.model||e.response?.model)===config.controller),
 naturalPortalIncomplete:observation?.frames.length===12&&observation.frames.filter(f=>!f.eye).length===config.missingEyes&&observation.active===false,
 allMissingEyesInserted:new Set(insertions.map(e=>JSON.stringify(e.position))).size===config.missingEyes,
 allEyesCrafted:eyeCrafts.length>=config.missingEyes,
 realNetherIngredients:barters.length>0&&blazes.length>=5&&eyeCrafts.some(e=>Date.parse(e.time)>Date.parse(entered?.time)),
 netherReturnedWithIngredients:!!exited&&exited.needs?.pearls===0&&exited.needs?.rods===0&&eyeCrafts.every(e=>Date.parse(e.time)<Date.parse(insertions[0]?.time)),
 noPlayerDeaths:!events.some(e=>e.type==='death'),
 correctSeed:proof.seed===config.seed,
 easyDifficulty:config.difficulty==='easy'&&proof.gameSettings?.difficulty===1&&events.find(e=>e.type==='start')?.state.difficulty==='easy',
 noOperatorAccount:JSON.parse(fs.readFileSync(dir+'/server-ops.json')).length===0,
 noGameCommands:!/(issued server command|\[JevAstra:|Set own game mode|Gave \d|Teleported JevAstra)/i.test(fs.readFileSync(dir+'/server-log.txt','utf8')),
 samePortalReturn:entered&&exited&&events.filter(e=>e.type==='nether_entered').length===1&&events.filter(e=>e.type==='nether_exited').length===1&&events.some(e=>e.type==='nether_route_arrived'&&e.region==='entry'),
 transparentBanner:JSON.parse(fs.readFileSync(dir+'/banner-manifest.json')).opacity<1
});
proof.ingredientEvidence={barters:barters.length,blazesKilled:blazes.length,eyesCrafted:eyeCrafts.length,framesFilled:insertions.length,initialFrames:observation,entered,exited};proof.passed=Object.values(proof.checks).every(Boolean);fs.writeFileSync(dir+'/verification.json',JSON.stringify(proof,null,2));console.log(JSON.stringify({passed:proof.passed,checks:proof.checks,ingredientEvidence:proof.ingredientEvidence},null,2));if(!proof.passed)process.exitCode=1;
