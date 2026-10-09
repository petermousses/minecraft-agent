import http from 'node:http';
import {MODEL_PATHS,requestDirect} from './models.mjs';

const allowedPaths=new Set(Object.values(MODEL_PATHS));
http.createServer(async(req,res)=>{
 try{
  if(req.method!=='POST')throw Error('POST required');
  let input='';
  for await(const chunk of req){input+=chunk;if(input.length>2000000)throw Error('Request too large');}
  const {path,body}=JSON.parse(input);
  if(!allowedPaths.has(path))throw Error('Unsupported model endpoint');
  const result=await requestDirect(path,body);
  res.writeHead(200,{'Content-Type':'application/json'});
  res.end(JSON.stringify(result));
 }catch(error){
  res.writeHead(502,{'Content-Type':'application/json'});
  res.end(JSON.stringify({error:error.message}));
 }
}).listen(Number(process.env.MODEL_RELAY_PORT||3099),'127.0.0.1',()=>console.log('Local LiteLLM relay ready; credential loaded from environment or ignored .env file.'));
