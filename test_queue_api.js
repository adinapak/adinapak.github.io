const assert = require('assert');
const handler = require('./api/queue');

function mockRes(){
  return {statusCode:0,headers:{},body:'',status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k]=v;},send(v){this.body=v;}};
}

async function run(){
  process.env.SPOTIFY_CLIENT_ID='cid';process.env.SPOTIFY_CLIENT_SECRET='sec';process.env.SPOTIFY_REFRESH_TOKEN='rt';
  let calls=[];
  global.fetch=async (url,init)=>{calls.push({url,init});
    if(String(url).includes('api/token')) return {ok:true,json:async()=>({access_token:'abc'}),status:200};
    return {ok:true,status:204,text:async()=>''};
  };
  let res=mockRes();
  await handler({method:'POST',query:{track_id:'123'}},res);
  assert.equal(res.statusCode,200);

  global.fetch=async (url)=> String(url).includes('api/token')
    ? {ok:true,json:async()=>({access_token:'abc'}),status:200}
    : {ok:false,status:403,text:async()=>JSON.stringify({error:{reason:'insufficient_scope',message:'Insufficient client scope'}})};
  res=mockRes();
  await handler({method:'POST',query:{track_id:'123'}},res);
  assert.equal(res.statusCode,403);

  global.fetch=async (url)=> String(url).includes('api/token')
    ? {ok:false,status:400,json:async()=>({error:'invalid_grant'})}
    : {ok:true,status:204,text:async()=>''};
  res=mockRes();
  await handler({method:'POST',query:{track_id:'123'}},res);
  assert.equal(res.statusCode,400);

  console.log('queue api tests passed');
}
run().catch((e)=>{console.error(e);process.exit(1);});
