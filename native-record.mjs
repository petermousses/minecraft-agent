import {existsSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
const control=resolve('native-client/record-path.txt');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function readJsonWhenReady(path,deadline,message){
 let lastError;
 while(Date.now()<deadline){
  try{return JSON.parse(readFileSync(path,'utf8'));}catch(error){lastError=error;}
  await sleep(100);
 }
 throw new Error(lastError?`${message}: ${lastError.message}`:message);
}
export async function startNativeRecording(dir,log){
 const file=resolve(dir,'full-playthrough.mp4');
 if(existsSync(file))throw Error('Refusing to overwrite native recording');
 writeFileSync(control,file);
 const deadline=Date.now()+30000;
 const start=await readJsonWhenReady(file+'.started.json',deadline,'Native recorder did not start');
 log('recording_started',{captureId:'native',renderer:'Minecraft Java 1.16.5',file,...start});
 let finishing;return ()=>finishing||=(async()=>{if(existsSync(control)&&readFileSync(control,'utf8').trim()===file)unlinkSync(control);
  const deadline=Date.now()+45000;const finish=await readJsonWhenReady(file+'.finished.json',deadline,'Native recorder did not finalize');if(finish.exitCode!==0)throw Error('Native video encoder failed');
  log('recording_finished',{captureId:'native',file,...finish});return finish;
 })();
}
