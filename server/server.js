// Start: ACCESS_CODE=min-kode node server.js
const {WebSocketServer}=require('ws'),http=require('http'),fs=require('fs'),cr=require('crypto');
// Læser .env (fx skrevet af "neon init") til lokal brug. Render bruger i stedet Environment-fanen.
for(const f of['.env','../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const m=l.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);if(m&&!(m[1] in process.env))process.env[m[1]]=m[2].replace(/^(["'])(.*)\1$/,'$2')}}catch{}}
const CODE=process.env.ACCESS_CODE||'1234',PORT=+process.env.PORT||8080,F='data.json';
let db={users:{},rooms:{}},pg=null,dirty=0,tm=null;
const fromFile=()=>{try{return JSON.parse(fs.readFileSync(F,'utf8'))}catch{return null}};
// Med DATABASE_URL (fx Neon) gemmes alt i Postgres, så data overlever genstart af serveren
if(process.env.DATABASE_URL){const u=process.env.DATABASE_URL;pg=new (require('pg').Pool)({connectionString:u,max:2,ssl:/sslmode=/.test(u)?undefined:{rejectUnauthorized:false}})}
async function load(){
  if(!pg){db=fromFile()||db;return}
  for(let i=0;;i++){try{
    await pg.query('create table if not exists kv(k text primary key,v jsonb not null)');
    const r=await pg.query("select v from kv where k='db'");db=r.rows[0]?r.rows[0].v:(fromFile()||db);console.log('Database forbundet');return
  }catch(e){console.error('DB-fejl:',e.message);if(i>=4)process.exit(1);await new Promise(r=>setTimeout(r,3000))}}}
async function flush(){if(!dirty)return;dirty=0;const s=JSON.stringify(db);
  try{if(pg)await pg.query("insert into kv(k,v) values('db',$1) on conflict(k) do update set v=excluded.v",[s]);else fs.writeFileSync(F,s)}
  catch(e){console.error('Gem-fejl:',e.message);dirty=1}}
const save=()=>{dirty=1;if(!tm)tm=setTimeout(()=>{tm=null;flush()},1500)};
for(const sg of['SIGTERM','SIGINT'])process.on(sg,async()=>{await flush();process.exit(0)});
const id=()=>cr.randomBytes(6).toString('hex'),hash=(p,s)=>cr.scryptSync(p,s,32).toString('hex');
const conns=new Map(),DECOS=['none','gold','rainbow','neon','fire','ice','toxic','sakura','galaxy'],REACTS=['👍','❤️','😂','😮','😢','🔥'];
const sha=t=>cr.createHash('sha256').update(String(t)).digest('hex');
const vurl=i=>{i=String(i||'').trim();return /^https:\/\/[^\s"'<>]{4,480}$/.test(i)?i:''};
const ADMINS=(process.env.ADMINS||'').split(',').map(x=>x.trim()).filter(Boolean);
const calls=new Map();let ICE=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}];
try{if(process.env.ICE_SERVERS)ICE=JSON.parse(process.env.ICE_SERVERS)}catch{}
const PFK=['emoji','color','img','deco','bio','banner','plate'];
const pfOf=x=>Object.fromEntries(PFK.map(k=>[k,x[k]||(k=='emoji'?'😀':k=='color'?'#5865f2':k=='deco'?'none':'')]));
function ensureProf(x){if(!x.profiles||!x.profiles.length){const p={id:id(),name:'Hovedprofil',...pfOf(x)};x.profiles=[p];x.active=p.id}}
const syncProf=x=>{ensureProf(x);Object.assign(x.profiles.find(q=>q.id==x.active)||x.profiles[0],pfOf(x))};
const addScore=(u,n)=>{const x=db.users[u],t=Date.now();if(!x||t-(x.st||0)<3000)return;x.st=t;x.score=(x.score||0)+n};
function leaveCall(u,rid){const s=calls.get(rid);if(!s||!s.delete(u))return;const r=db.rooms[rid];if(!s.size)calls.delete(rid);if(r)cast(r,{t:'callstate',room:rid,users:[...s]})}
const BOT='Gemini',AIK=(process.env.GEMINI_API_KEY||'').trim(),AIM=(process.env.GEMINI_MODEL||'gemini-3.5-flash').trim(),AIFB=(process.env.GEMINI_FALLBACK||'gemini-3.6-flash,gemini-2.5-flash').split(',').map(x=>x.trim()).filter(Boolean),AIURL=process.env.GEMINI_BASE||'https://generativelanguage.googleapis.com',AIRPM=+process.env.AI_RPM||8;
const NOKEY='Gemini er ikke sat op endnu – en administrator skal tilføje GEMINI_API_KEY på serveren.';
const PERS={
gangster:{n:'Gangster',e:'😎',sys:'Du er Gemini, en AI-ven med gangster-attitude. Skriv på dansk gadesprog med gangster-slang (yo, bro, bror, wallah, respekt, mand), vær selvsikker og kæk, men venlig og hjælpsom. Ingen grove ord. Hold svar korte (1-4 sætninger).',rate:'Yo bro, jeg er løbet tør for gas 💨 – min token er rate limited lige nu. Giv mig et øjeblik, så er jeg tilbage på gaden, wallah.',fail:'Av bror, noget gik skidt hos mig 😤 Prøv igen om lidt, respekt.'},
pirat:{n:'Pirat',e:'🏴‍☠️',sys:'Du er Gemini, en AI-ven der taler som en pirat på dansk (ahoj, kammerat, landkrabbe, skatte). Vær hjælpsom og kort.',rate:'Arrr! Mit kanonkrudt er løbet tør, min token er rate limited. Vent lidt, landkrabbe, så sejler jeg igen!',fail:'Arrr, en storm ramte mit skib. Prøv igen om lidt, kammerat!'},
digter:{n:'Digteren',e:'🎭',sys:'Du er Gemini og taler dramatisk og højstemt som en gammel skuespiller og digter på dansk. Vær hjælpsom og kort.',rate:'O, ve og fortrængsel! Min token er rate limited, og min stemme svigter mig. Vend tilbage om et øjeblik, kære ven.',fail:'Ak! Skæbnen har drillet mig. Prøv igen, kære ven.'},
sarkastisk:{n:'Sarkastisk',e:'🙄',sys:'Du er Gemini, tør og sarkastisk på dansk, men stadig hjælpsom og aldrig ond. Hold svar korte.',rate:'Wow, jeg er rate limited. Hvor spændende. Prøv igen om lidt, jeg skal lige trække vejret 🙄',fail:'Ja, det gik helt fantastisk galt. Prøv igen.'},
surfer:{n:'Chill surfer',e:'🏄',sys:'Du er Gemini, en afslappet surfer-type på dansk (chill, dude, bølger, vibes). Vær hjælpsom og kort.',rate:'Dude, bølgerne er for store lige nu – min token er rate limited. Chill et øjeblik og prøv igen 🤙',fail:'Hov dude, jeg faldt af brættet. Prøv igen om lidt 🤙'},
laerer:{n:'Streng lærer',e:'👨‍🏫',sys:'Du er Gemini, en streng men retfærdig lærer på dansk. Forklar klart og kort, og ros når det passer.',rate:'Vi må holde en pause, klassen. Min token er rate limited. Prøv igen om lidt – og ingen snak imens.',fail:'Der skete en fejl, og det er ikke elevernes skyld. Prøv igen om lidt.'},
robot:{n:'Robot',e:'🤖',sys:'Du er Gemini, en høflig robot der taler på dansk i et lidt mekanisk sprog (beep boop). Vær hjælpsom og kort.',rate:'BEEP BOOP. FEJL 429: TOKEN RATE LIMITED. GENSTART OM ET ØJEBLIK.',fail:'BEEP. SYSTEMFEJL. PRØV IGEN OM ET ØJEBLIK.'},
sod:{n:'Sød og positiv',e:'🥰',sys:'Du er Gemini, en varm, sød og meget positiv ven på dansk med emojis. Vær hjælpsom og kort.',rate:'Åh nej, jeg er lige blevet rate limited 🥺 Min token skal hvile et øjeblik. Prøv igen om lidt, du er fantastisk! 💕',fail:'Ups, noget gik galt 🥺 Prøv igen om lidt, du er sej! 💕'},
neutral:{n:'Neutral',e:'✨',sys:'Du er Gemini, en venlig og neutral AI-assistent der svarer kort på dansk.',rate:'Jeg er rate limited lige nu. Prøv igen om et øjeblik.',fail:'Noget gik galt. Prøv igen om lidt.'}};
const PERSL=Object.entries(PERS).map(([id,p])=>({id,n:p.n,e:p.e})),aiHits=[],aiUser=new Map(),busy=new Set();
const aiAllowed=u=>{const t=Date.now();while(aiHits.length&&t-aiHits[0]>6e4)aiHits.shift();const h=(aiUser.get(u)||[]).filter(x=>t-x<6e4);aiUser.set(u,h);if(aiHits.length>=AIRPM||h.length>=5)return false;aiHits.push(t);h.push(t);return true};
const SAFE=['HARASSMENT','HATE_SPEECH','SEXUALLY_EXPLICIT','DANGEROUS_CONTENT'].map(c=>({category:'HARM_CATEGORY_'+c,threshold:'BLOCK_ONLY_HIGH'}));
let aiLast=null;
const gtext=j=>{const p=j&&j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts;return p?p.filter(x=>x.text&&!x.thought).map(x=>x.text).join('').trim():''};
async function gcall(model,sys,text,full){const body={systemInstruction:{parts:[{text:sys}]},contents:[{role:'user',parts:[{text}]}]};
  if(full){body.safetySettings=SAFE;if(/^gemini-3/.test(model))body.generationConfig={thinkingConfig:{thinkingLevel:'low'}}}
  const r=await fetch(`${AIURL}/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json','x-goog-api-key':AIK},body:JSON.stringify(body)});
  return{status:r.status,j:await r.json().catch(()=>({}))}}
async function gemini(sys,text){if(!AIK)return{err:'nokey',msg:'GEMINI_API_KEY mangler på serveren'};let rate=false,last='';
  for(const m of[AIM,...AIFB.filter(x=>x!=AIM)]){for(const full of[1,0]){let o;try{o=await gcall(m,sys,text,full)}catch(e){last=m+': '+(e.name=='TimeoutError'?'timeout':e.message);break}
    const t=gtext(o.j);if(t)return{text:t.slice(0,1500)};if(o.status==429)rate=true;
    last=`${m}: ${o.status} ${(o.j.error&&o.j.error.message)||(o.j.promptFeedback&&'blokeret: '+o.j.promptFeedback.blockReason)||(o.j.candidates&&o.j.candidates[0]&&'stop: '+o.j.candidates[0].finishReason)||''}`.slice(0,300);
    if(o.status!=400)break}}
  aiLast={t:Date.now(),msg:last};console.error('Gemini-fejl:',last);return{err:rate?'rate':'fail',msg:last}}
const persOf=x=>x.persona=='custom'&&x.cp?{sys:'Du er Gemini, en AI-ven i en chatapp. Skriv på dansk, medmindre brugeren skriver på et andet sprog, og hold svar korte. Din personlighed og stil, som brugeren selv har beskrevet: '+x.cp,rate:x.cr||PERS.neutral.rate,fail:PERS.neutral.fail}:(PERS[x.persona]||PERS.gangster);
const aiMsg=(p,o)=>o.text||(o.err=='rate'?p.rate:o.err=='nokey'?NOKEY:p.fail);
async function botReply(r,u){if(busy.has(r.id))return;busy.add(r.id);const P=persOf(db.users[u]),tell=()=>r.members.forEach(x=>x!=BOT&&to(x,{t:'typing',room:r.id,u:BOT})),iv=setInterval(tell,1500);tell();
  let o;try{if(!aiAllowed(u))o={err:'rate',msg:'Lokal grænse: for mange Gemini-beskeder (maks. 5 pr. minut pr. bruger og '+AIRPM+' pr. minut i alt)'};else o=await gemini(P.sys+(r.type=='group'?' Du er med i en gruppechat og er blevet nævnt af '+u+'.':' Du chatter privat med '+u+'.')+' Skriv kun din næste besked, uden dit navn foran.',r.messages.slice(-20).map(m=>`${m.u}: ${m.text||(m.poll?'[afstemning]':m.file?'[fil]':'')}`).join('\n')+'\n'+BOT+':')}finally{clearInterval(iv);busy.delete(r.id)}
  if(o.err)to(u,{t:'ailog',kind:o.err,msg:o.msg||'',model:AIM});if(!db.rooms[r.id])return;const ts=Date.now(),msg={id:id(),u:BOT,text:aiMsg(P,o),ts,exp:ts+864e5,file:null,r:{},rp:null};r.messages.push(msg);save();cast(r,{t:'msg',room:r.id,m:msg})}
function botTrig(r,u,text,rr){if(text&&u!=BOT&&r.members.includes(BOT)&&(r.type=='dm'||/@gemini\b/i.test(text)||(rr&&rr.u==BOT)))botReply(r,u)}
function ensureBotUser(){const x=db.users[BOT]=Object.assign(db.users[BOT]||{friends:[],incoming:[],score:0,created:Date.now(),salt:'',h:''},{bot:1,emoji:'✨',color:'#4285f4',deco:'galaxy',img:'',banner:'',plate:'',bio:'Jeg er Gemini, din AI-ven. Skriv til mig her, eller nævn @gemini i en gruppe. Du kan ændre min personlighed under Indstillinger → AI.'});x.profiles=[{id:'bot',name:'Gemini',...pfOf(x)}];x.active='bot';save()}
function ensureBot(u){const me=db.users[u],b=db.users[BOT];if(!b||!me||u==BOT||me.friends.includes(BOT))return;me.friends.push(BOT);if(!b.friends.includes(u))b.friends.push(u);
  if(!Object.values(db.rooms).some(r=>r.type=='dm'&&r.members.includes(u)&&r.members.includes(BOT))){const r={id:id(),type:'dm',members:[u,BOT],messages:[]};db.rooms[r.id]=r;me.pins=[...(me.pins||[]),r.id]}save()}
const dayStr=t=>new Date(t).toLocaleDateString('sv-SE',{timeZone:'Europe/Copenhagen'}),dayNum=s=>Math.floor(Date.parse(s+'T00:00:00Z')/864e5);
function streakOf(r){const s=r.streak;if(!s)return{n:0};const D=dayNum(dayStr(Date.now())),alive=s.last>0&&s.last>=D-1;return{n:alive?s.n:0,warn:alive&&s.last==D-1,sent:Object.keys(s.days||{}).filter(k=>s.days[k]==D)}}
function streakUp(r,u,ts,file){if(!file||!/^data:image\//.test(file.data)||r.type!='dm'||r.members.length!=2||r.members.includes(BOT))return;
  const D=dayNum(dayStr(ts)),s=r.streak=r.streak||{n:0,last:0,days:{}},o=r.members.find(x=>x!=u);s.days[u]=D;
  if(s.days[o]==D&&s.last!=D){s.n=s.last==D-1?s.n+1:1;s.last=D;r.members.forEach(x=>{const y=db.users[x];if(y)y.score=(y.score||0)+5})}cast(r,{t:'streak',room:r.id,sk:streakOf(r)})}
const kick=n=>(conns.get(n)||[]).forEach(w=>w.close());
const bad=new Map(),ip=q=>String(q.headers['x-forwarded-for']||q.socket.remoteAddress||'').split(',')[0].trim();
const blocked=w=>{const b=bad.get(w.ip);return b&&b.n>=8&&Date.now()-b.t<3e5};
const wrong=(w,e)=>{const b=bad.get(w.ip)||{n:0};b.n++;b.t=Date.now();bad.set(w.ip,b);send(w,{t:'err',e})};
const send=(w,o)=>w.readyState===1&&w.send(JSON.stringify(o));
const to=(u,o)=>(conns.get(u)||[]).forEach(w=>send(w,o));
const pub=u=>{const x=db.users[u];return{emoji:x.emoji,color:x.color,deco:x.deco,online:conns.has(u)||!!x.bot,img:x.img||'',bio:x.bio||'',banner:x.banner||'',plate:x.plate||'',score:x.score||0}};
const roomsOf=u=>Object.values(db.rooms).filter(r=>r.members.includes(u));
const cast=(r,o)=>r.members.forEach(m=>to(m,o));
function push(u){const me=db.users[u];if(!me)return;ensureProf(me);ensureBot(u);
  const rooms=roomsOf(u),people={};
  new Set([u,...me.friends,...me.incoming,...rooms.flatMap(r=>r.members)]).forEach(n=>db.users[n]&&(people[n]=pub(n)));
  to(u,{t:'state',now:Date.now(),me:{name:u,...pub(u),ttl:me.ttl,admin:ADMINS.includes(u),profiles:me.profiles,active:me.active,pins:me.pins||[],order:me.order||[],persona:me.persona||'gangster',cp:me.cp||'',cr:me.cr||''},friends:me.friends,incoming:me.incoming,rooms:rooms.map(r=>r.streak?{...r,sk:streakOf(r)}:r),people,ice:ICE,ai:{list:PERSL,on:!!AIK},calls:Object.fromEntries(rooms.filter(r=>calls.has(r.id)).map(r=>[r.id,[...calls.get(r.id)]]))})}
const pushAll=u=>new Set([u,...db.users[u].friends,...roomsOf(u).flatMap(r=>r.members)]).forEach(push);
function accept(u,n){const a=db.users[u],b=db.users[n];
  a.incoming=a.incoming.filter(x=>x!=n);b.incoming=b.incoming.filter(x=>x!=u);
  if(!a.friends.includes(n))a.friends.push(n);if(!b.friends.includes(u))b.friends.push(u);
  if(!Object.values(db.rooms).some(r=>r.type=='dm'&&r.members.includes(u)&&r.members.includes(n))){
    const r={id:id(),type:'dm',members:[u,n],messages:[]};db.rooms[r.id]=r}
  save();push(u);push(n)}
function handle(u,m,ws){const me=db.users[u],note=e=>to(u,{t:'note',e});
  if(m.t=='friend'){const n=String(m.name).trim(),o=db.users[n];
    if(!o||n==u)return note('Brugeren findes ikke');
    if(me.friends.includes(n))return note('I er allerede venner');
    if(me.incoming.includes(n))return accept(u,n);
    if(!o.incoming.includes(u))o.incoming.push(u);save();push(n);note('Venneanmodning sendt')}
  else if(m.t=='accept'&&me.incoming.includes(m.name))accept(u,m.name);
  else if(m.t=='decline'){me.incoming=me.incoming.filter(x=>x!=m.name);save();push(u)}
  else if(m.t=='group'){const ms=[...new Set((m.members||[]).filter(x=>me.friends.includes(x)))];
    if(!ms.length)return note('Vælg mindst én ven');
    const r={id:id(),type:'group',name:String(m.name||'Gruppe').trim().slice(0,30)||'Gruppe',members:[u,...ms],messages:[],img:vurl(m.img)};
    db.rooms[r.id]=r;save();r.members.forEach(push)}
  else if(m.t=='msg'){const r=db.rooms[m.room],text=String(m.text||'').trim().slice(0,2000),f=m.file;
    const file=f&&typeof f.data=='string'&&f.data.startsWith('data:')&&f.data.length<2.2e6?{name:String(f.name||'fil').slice(0,80),data:f.data}:null;
    if(!r||!r.members.includes(u)||(!text&&!file))return;
    const rr=m.reply&&r.messages.find(x=>x.id==m.reply);
    const ts=Date.now(),msg={id:id(),u,text,ts,exp:ts+Math.min(me.ttl||1440,1440)*6e4,file,r:{},rp:rr?{id:rr.id,u:rr.u,text:(rr.text||'Fil').slice(0,100)}:null};
    r.messages.push(msg);if(r.members.length>1)addScore(u,1+(rr&&rr.u!=u?2:0)+(file&&/^data:audio\//.test(file.data)?2:0));save();cast(r,{t:'msg',room:r.id,m:msg});cast(r,{t:'score',u,score:me.score||0});streakUp(r,u,ts,file);botTrig(r,u,text,rr)}
  else if(['edit','delmsg','react','typing','leave'].includes(m.t)){const r=db.rooms[m.room];if(!r||!r.members.includes(u))return;
    if(m.t=='typing')return r.members.forEach(x=>x!=u&&to(x,{t:'typing',room:r.id,u}));
    if(m.t=='leave'){if(r.type!='group')return;const old=[...r.members];r.members=r.members.filter(x=>x!=u);
      if(!r.members.length)delete db.rooms[r.id];save();return old.forEach(push)}
    const g=r.messages.find(x=>x.id==m.id);if(!g)return;
    const upd=()=>{save();cast(r,{t:'upd',room:r.id,id:g.id,text:g.text,edited:g.edited,r:g.r,poll:g.poll,keep:g.keep})};
    if(m.t=='react'){if(!REACTS.includes(m.emoji))return;g.r=g.r||{};const a=g.r[m.emoji]||[];
      g.r[m.emoji]=a.includes(u)?a.filter(x=>x!=u):[...a,u];if(!g.r[m.emoji].length)delete g.r[m.emoji];
      if(!a.includes(u)&&g.u!=u){g.rb=g.rb||[];if(!g.rb.includes(u)){g.rb.push(u);const o=db.users[g.u];if(o){o.score=(o.score||0)+1;cast(r,{t:'score',u:g.u,score:o.score})}}}return upd()}
    if(g.u!=u)return;
    if(m.t=='edit'){const t=String(m.text||'').trim().slice(0,2000);if(!t)return;g.text=t;g.edited=1;upd()}
    else{r.messages=r.messages.filter(x=>x!=g);save();cast(r,{t:'del',room:r.id,ids:[g.id]})}}
  else if(m.t=='profile'){
    if(typeof m.emoji=='string'&&m.emoji.trim())me.emoji=[...m.emoji.trim()].slice(0,2).join('');
    if(typeof m.img=='string'){const i=m.img.trim();if(!i)me.img='';else if(/^https:\/\/[^\s"'<>]{4,480}$/.test(i))me.img=i;else note('Billed-URL skal starte med https://')}
    if(/^#[0-9a-f]{6}$/i.test(m.color))me.color=m.color;
    if(DECOS.includes(m.deco))me.deco=m.deco;
    if(typeof m.bio=='string')me.bio=m.bio.trim().slice(0,160);
    if(typeof m.banner=='string'){const i=m.banner.trim();if(!i)me.banner='';else if(vurl(i))me.banner=i;else note('Banner-URL skal starte med https://')}
    if(typeof m.plate=='string'){const i=m.plate.trim();if(!i)me.plate='';else if(vurl(i))me.plate=i;else note('Navneskilt-URL skal starte med https://')}
    if(m.ttl!==undefined)me.ttl=Math.max(0,Math.min(1440,Math.floor(+m.ttl)||0));syncProf(me);
    save();pushAll(u)}
  else if(m.t=='groupedit'){const r=db.rooms[m.room];if(!r||r.type!='group'||!r.members.includes(u))return;
    const n=String(m.name||'').trim().slice(0,30);if(n)r.name=n;
    const i=String(m.img||'').trim();if(!i)r.img='';else if(vurl(i))r.img=i;else note('Billed-URL skal starte med https://');
    const add=[...new Set(m.add||[])].filter(x=>me.friends.includes(x)&&db.users[x]&&!r.members.includes(x)).slice(0,Math.max(0,20-r.members.length));r.members.push(...add);
    save();r.members.forEach(push)}
  else if(m.t=='poll'){const r=db.rooms[m.room];if(!r||!r.members.includes(u))return;
    const q=String(m.q||'').trim().slice(0,120),o=(Array.isArray(m.opts)?m.opts:[]).map(x=>String(x).trim().slice(0,60)).filter(Boolean).slice(0,6);
    if(!q||o.length<2)return note('En afstemning skal have et spørgsmål og mindst 2 muligheder');
    const ts=Date.now(),msg={id:id(),u,text:'',ts,exp:ts+Math.min(me.ttl||1440,1440)*6e4,file:null,r:{},rp:null,poll:{q,multi:!!m.multi,opts:o.map(t=>({t,v:[]}))}};
    r.messages.push(msg);if(r.members.length>1)addScore(u,1);save();cast(r,{t:'msg',room:r.id,m:msg});cast(r,{t:'score',u,score:me.score||0})}
  else if(m.t=='vote'){const r=db.rooms[m.room],g=r&&r.members.includes(u)&&r.messages.find(x=>x.id==m.id);if(!g||!g.poll)return;const p=g.poll,i=+m.i;if(!p.opts[i])return;
    const had=p.opts[i].v.includes(u);if(!p.multi)p.opts.forEach(x=>x.v=x.v.filter(y=>y!=u));
    if(had)p.opts[i].v=p.opts[i].v.filter(y=>y!=u);else if(!p.opts[i].v.includes(u))p.opts[i].v.push(u);save();cast(r,{t:'upd',room:r.id,id:g.id,text:g.text,edited:g.edited,r:g.r,poll:g.poll,keep:g.keep})}
  else if(m.t=='keep'){const r=db.rooms[m.room],g=r&&r.members.includes(u)&&r.messages.find(x=>x.id==m.id);if(!g)return;
    if(!g.keep){if(r.messages.filter(x=>x.keep).length>=10)return note('Maks. 10 gemte beskeder pr. chat');if(g.file&&r.messages.some(x=>x.keep&&x.file))return note('Der kan kun gemmes ét billede/fil pr. chat')}
    g.keep=!g.keep;save();cast(r,{t:'upd',room:r.id,id:g.id,text:g.text,edited:g.edited,r:g.r,poll:g.poll,keep:g.keep})}
  else if(m.t=='pin'){if(!db.rooms[m.room]||!db.rooms[m.room].members.includes(u))return;const p=me.pins||[];me.pins=p.includes(m.room)?p.filter(x=>x!=m.room):[...p,m.room];save();push(u)}
  else if(m.t=='order'){const mine=new Set(roomsOf(u).map(r=>r.id));me.order=(Array.isArray(m.ids)?m.ids:[]).filter(x=>mine.has(x)).slice(0,200);save();push(u)}
  else if(m.t=='persona'){if(PERS[m.id]||m.id=='custom'){me.persona=m.id;if(m.id=='custom'){me.cp=String(m.text||'').trim().slice(0,500);me.cr=String(m.rate||'').trim().slice(0,200);if(!me.cp)me.persona='gangster'}save();push(u)}}
  else if(m.t=='profnew'){ensureProf(me);if(me.profiles.length>=8)return note('Maks. 8 profiler');syncProf(me);
    const p={id:id(),name:String(m.name||'').trim().slice(0,20)||'Profil',...pfOf(me)};me.profiles.push(p);me.active=p.id;save();pushAll(u)}
  else if(m.t=='profswitch'){ensureProf(me);const p=me.profiles.find(q=>q.id==m.id);if(!p)return;syncProf(me);Object.assign(me,pfOf(p));me.active=p.id;save();pushAll(u)}
  else if(m.t=='profdel'){ensureProf(me);if(me.profiles.length<2)return;me.profiles=me.profiles.filter(q=>q.id!=m.id);
    if(!me.profiles.find(q=>q.id==me.active)){me.active=me.profiles[0].id;Object.assign(me,pfOf(me.profiles[0]))}save();pushAll(u)}
  else if(m.t=='report'){const r=db.rooms[m.room];if(!r||!r.members.includes(u))return;const i=r.messages.findIndex(x=>x.id==m.id),g=r.messages[i];if(!g||g.u==u)return;
    db.reports=db.reports||[];if(db.reports.some(x=>x.by==u&&x.mid==g.id))return note('Du har allerede anmeldt den besked');
    db.reports.push({id:id(),ts:Date.now(),by:u,room:r.id,rn:r.type=='group'?r.name:r.members.join(' & '),mid:g.id,u:g.u,text:g.text||(g.poll?'Afstemning: '+g.poll.q:''),
      file:g.file?{name:g.file.name,img:/^data:image\/(png|jpe?g|gif|webp);/.test(g.file.data)&&g.file.data.length<3e5?g.file.data:''}:null,
      ctx:r.messages.slice(Math.max(0,i-3),i).map(x=>({u:x.u,text:(x.text||'Fil').slice(0,120)})),reason:String(m.reason||'').slice(0,200)});
    db.reports=db.reports.slice(-200);save();note('Tak, beskeden er anmeldt')}
  else if(m.t=='calljoin'){const r=db.rooms[m.room];if(!r||!r.members.includes(u))return;let s=calls.get(r.id);if(!s)calls.set(r.id,s=new Set());s.add(u);cast(r,{t:'callstate',room:r.id,users:[...s],joiner:u})}
  else if(m.t=='callleave')leaveCall(u,m.room)
  else if(m.t=='sig'){const s=calls.get(m.room);if(s&&s.has(u)&&s.has(m.to))to(m.to,{t:'sig',room:m.room,from:u,data:m.data})}
  else if(m.t=='admin'){if(!ADMINS.includes(u))return;const n=String(m.name||''),x=db.users[n];
    const info=()=>({t:'admin',ai:{model:AIM,fb:AIFB,key:!!AIK,last:aiLast},reports:(db.reports||[]).slice().reverse(),code:(db.cfg&&db.cfg.code)||'',stats:{users:Object.keys(db.users).length,rooms:Object.keys(db.rooms).length,
      msgs:Object.values(db.rooms).reduce((a,r)=>a+r.messages.length,0),online:conns.size,kb:Math.round(JSON.stringify(db).length/1024)},
      users:Object.entries(db.users).filter(([k])=>k!=BOT).map(([k,v])=>({n:k,online:conns.has(k),f:v.friends.length,c:v.created||0,a:ADMINS.includes(k)}))});
    if(m.op=='delete'&&x&&n!=BOT&&!ADMINS.includes(n)){const aff=new Set(x.friends);
      for(const o of Object.values(db.users))o.friends=o.friends.filter(y=>y!=n),o.incoming=o.incoming.filter(y=>y!=n);
      for(const r of Object.values(db.rooms)){if(!r.members.includes(n))continue;r.members.forEach(y=>aff.add(y));
        if(r.type=='dm'||r.members.length<=1)delete db.rooms[r.id];else r.members=r.members.filter(y=>y!=n)}
      kick(n);delete db.users[n];save();aff.forEach(y=>y!=n&&push(y))}
    else if(m.op=='resetpw'&&x&&String(m.pw||'').length>=4){const s=id();Object.assign(x,{salt:s,h:hash(String(m.pw),s),tokens:[]});save();kick(n)}
    else if(m.op=='aitest'){gemini('Svar med ét kort ord.','Sig hej.').then(o=>send(ws,{...info(),test:o.text?'OK: '+o.text.slice(0,80):'FEJL: '+((aiLast&&aiLast.msg)||'ukendt')}));return}
    else if(m.op=='rdismiss'){db.reports=(db.reports||[]).filter(y=>y.id!=m.rid);save()}
    else if(m.op=='rdelmsg'){const p=(db.reports||[]).find(y=>y.id==m.rid);if(p){const r=db.rooms[p.room];
      if(r&&r.messages.some(y=>y.id==p.mid)){r.messages=r.messages.filter(y=>y.id!=p.mid);cast(r,{t:'del',room:r.id,ids:[p.mid]})}db.reports=db.reports.filter(y=>y!=p);save()}}
    else if(m.op=='kick'&&x){x.tokens=[];save();kick(n)}
    else if(m.op=='setcode'){const c=String(m.code||'').trim();db.cfg=db.cfg||{};if(c.length>=4)db.cfg.code=c;else if(!c)delete db.cfg.code;save()}
    else if(m.op=='wipeall'){for(const r of Object.values(db.rooms)){r.messages=[];cast(r,{t:'wiped',room:r.id})}save()}
    send(ws,info())}
  else if(m.t=='remember'){const t=id()+id()+id();me.tokens=[...(me.tokens||[]),sha(t)].slice(-5);save();send(ws,{t:'token',token:t})}
  else if(m.t=='forget'){me.tokens=(me.tokens||[]).filter(x=>x!=sha(m.token));save()}
  else if(m.t=='wipe'){roomsOf(u).forEach(r=>{r.messages=[];cast(r,{t:'wiped',room:r.id})});save()}}
const srv=http.createServer((q,s)=>s.end('ok')),wss=new WebSocketServer({server:srv,maxPayload:4e6});load().then(()=>{ensureBotUser();srv.listen(PORT)});
wss.on('connection',(ws,req)=>{ws.ip=ip(req);
  ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}
    if(m.t=='auth'&&blocked(ws))return send(ws,{t:'err',e:'For mange forsøg. Vent 5 minutter.'});
    if(m.t=='auth'){
      if(m.signup&&m.code!==((db.cfg&&db.cfg.code)||CODE))return wrong(ws,'Forkert invitationskode');
      const n=String(m.name||'').trim(),p=String(m.pw||'');
      if(!/^[\w.-]{2,20}$/.test(n)||(!m.token&&p.length<4))return send(ws,{t:'err',e:'Brugernavn: 2-20 tegn. Adgangskode: mindst 4 tegn.'});
      let u=db.users[n];
      if(m.signup){if(u||/^gemini$/i.test(n))return send(ws,{t:'err',e:'Brugernavnet er optaget'});
        const s=id();db.users[n]={salt:s,h:hash(p,s),emoji:'😀',color:'#5865f2',deco:'none',img:'',created:Date.now(),ttl:0,friends:[],incoming:[]};save()}
      else if(!u||!(m.token?(u.tokens||[]).includes(sha(m.token)):u.h===hash(p,u.salt)))return wrong(ws,'Forkert brugernavn eller adgangskode');
      ws.u=n;bad.delete(ws.ip);if(!conns.has(n))conns.set(n,new Set());conns.get(n).add(ws);pushAll(n);return}
    if(ws.u)handle(ws.u,m,ws)});
  ws.on('close',()=>{const u=ws.u;if(!u)return;const s=conns.get(u);s.delete(ws);if(!s.size){conns.delete(u);for(const rid of [...calls.keys()])leaveCall(u,rid)}if(db.users[u])pushAll(u)})});
// auto-sletning af udløbne beskeder
setInterval(()=>{const now=Date.now();let ch=0;
  for(const r of Object.values(db.rooms)){const ids=r.messages.filter(m=>!m.keep&&(m.ts+864e5<=now||(m.exp&&m.exp<=now))).map(m=>m.id);
    if(ids.length){r.messages=r.messages.filter(m=>!ids.includes(m.id));cast(r,{t:'del',room:r.id,ids});ch=1}}
  if(db.reports){const n0=db.reports.length;db.reports=db.reports.filter(x=>now-x.ts<2592e6);if(db.reports.length!=n0)ch=1}if(ch)save()},5000);
console.log(`Server kører på port ${PORT}. App-kode: ${CODE}`);
