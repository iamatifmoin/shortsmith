/**
 * Bare-bones operator review screen (Gate 1), served by the ideation app at
 * GET /review/ui. Deliberately a single self-contained page — the real Next.js
 * dashboard (apps/web) comes later. Vanilla JS, no build step; it just calls the
 * review API on the same origin. Kept backtick-free so it embeds cleanly here.
 */
export const REVIEW_UI_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shortsmith - Review</title>
<style>
 :root{--bg:#0f1115;--card:#171a21;--mut:#8a93a6;--fg:#e8ecf3;--acc:#ff4d8d;--ok:#3ecf8e;--warn:#f0b429;--line:#242a35}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,Segoe UI,Roboto,sans-serif}
 header{position:sticky;top:0;background:#0f1115ee;backdrop-filter:blur(6px);border-bottom:1px solid var(--line);padding:12px 18px;display:flex;align-items:center;gap:12px;z-index:5}
 header h1{font-size:16px;margin:0;font-weight:700}
 .sp{flex:1}
 button{background:#222836;color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:7px 12px;cursor:pointer;font:inherit}
 button:hover{border-color:#3a4252}
 button.ok{background:var(--ok);border-color:var(--ok);color:#06251a;font-weight:700}
 .wrap{max-width:860px;margin:0 auto;padding:18px}
 .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:0 0 16px}
 .meta{color:var(--mut);font-size:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
 .flags{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
 .flag{font-size:11px;background:#3a2a0f;color:var(--warn);border:1px solid #5a4418;border-radius:999px;padding:2px 8px}
 label{display:block;color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin:10px 0 3px}
 textarea{width:100%;background:#0e1016;color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit;resize:vertical}
 .claims{margin-top:12px;border-top:1px solid var(--line);padding-top:10px}
 .claim{font-size:13px;color:#cdd3df;padding:6px 0;border-bottom:1px dashed var(--line)}
 .claim .s{color:var(--mut)}
 .badge{font-size:10px;border-radius:4px;padding:1px 5px;margin-left:6px}
 .b-conf{background:#06251a;color:var(--ok)} .b-strong{background:#3a2a0f;color:var(--warn)} .b-rumor{background:#3a1420;color:var(--acc)} .b-unv{background:#3a1420;color:var(--acc)}
 .actions{display:flex;gap:8px;margin-top:14px;align-items:center;flex-wrap:wrap}
 .empty{color:var(--mut);text-align:center;padding:60px 0}
 a{color:#7db4ff}
</style></head>
<body>
<header><h1>Shortsmith &middot; Review</h1><span class="sp"></span>
 <span id="count" class="meta"></span>
 <button onclick="load()">Refresh</button>
 <button onclick="window.open('/review/approved','_blank')">Export approved</button>
</header>
<div class="wrap" id="wrap"><div class="empty">Loading...</div></div>
<script>
const api=(u,o)=>fetch(u,o).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);const ct=r.headers.get('content-type')||'';return ct.includes('json')?r.json():r.text();});
function el(t,cls,txt){const e=document.createElement(t);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;}
function labeled(name,input){const w=document.createElement('div');w.appendChild(el('label',null,name));w.appendChild(input);return w;}
function confBadge(c){const m={CONFIRMED:'b-conf',STRONG_RUMOR:'b-strong',RUMOR:'b-rumor'};return el('span','badge '+(m[c]||''),c||'?');}
async function load(){
 const wrap=document.getElementById('wrap');wrap.innerHTML='';
 let items;try{items=await api('/review/queue');}catch(e){wrap.appendChild(el('div','empty','Failed to load: '+e.message));return;}
 document.getElementById('count').textContent=items.length+' in queue';
 if(!items.length){wrap.appendChild(el('div','empty','Queue empty - nothing to review.'));return;}
 items.forEach(it=>wrap.appendChild(card(it)));
}
function card(it){
 const c=el('div','card');
 const meta=el('div','meta');
 meta.appendChild(el('span',null,it.seriesKey+' / '+it.angleType));
 meta.appendChild(el('span',null,'~'+it.estDurationSec+'s / '+it.wordCount+'w'));
 meta.appendChild(el('span',null,'hook '+it.hookScore));
 c.appendChild(meta);
 if(it.flags&&it.flags.length){const f=el('div','flags');it.flags.forEach(x=>f.appendChild(el('span','flag','! '+x)));c.appendChild(f);}
 const hook=el('textarea');hook.rows=2;hook.value=it.hook;c.appendChild(labeled('Hook',hook));
 const body=el('textarea');body.rows=4;body.value=it.body;c.appendChild(labeled('Body',body));
 const cta=el('textarea');cta.rows=2;cta.value=it.cta;c.appendChild(labeled('CTA',cta));
 const pub=it.publish||{};
 const title=el('textarea');title.rows=2;title.value=pub.title||'';c.appendChild(labeled('YouTube title',title));
 const desc=el('textarea');desc.rows=5;desc.value=pub.description||'';c.appendChild(labeled('YouTube description',desc));
 const tags=el('textarea');tags.rows=2;tags.value=(pub.tags||[]).join(', ');c.appendChild(labeled('YouTube tags (comma-separated)',tags));
 const ig=el('textarea');ig.rows=4;ig.value=pub.igCaption||'';c.appendChild(labeled('Instagram caption',ig));
 const thumb=el('textarea');thumb.rows=1;thumb.value=pub.thumbnailText||'';c.appendChild(labeled('Thumbnail text',thumb));
 const bgm=el('div','meta');bgm.style.marginTop='6px';bgm.textContent='background: '+(pub.backgroundSuggestion||'—')+'  ·  music: '+(pub.musicMood||'—');c.appendChild(bgm);
 const cl=el('div','claims');cl.appendChild(el('div','meta','Sources & receipts'));
 (it.claims||[]).forEach(cm=>{
  const d=el('div','claim');
  d.appendChild(el('span','s','"'+String(cm.snippet||'').slice(0,160)+'"'));
  d.appendChild(confBadge(cm.confidence));
  if(cm.sourceTier)d.appendChild(el('span','badge','T'+cm.sourceTier));
  if(cm.snippetVerified===false)d.appendChild(el('span','badge b-unv','snippet?'));
  if(cm.publishedAt)d.appendChild(el('span','badge',String(cm.publishedAt).slice(0,10)));
  const a=el('a',null,'source');a.href=cm.sourceUrl;a.target='_blank';a.style.marginLeft='8px';d.appendChild(a);
  cl.appendChild(d);
 });
 c.appendChild(cl);
 const act=el('div','actions');
 const appr=el('button','ok','Approve');appr.onclick=async()=>{try{await api('/review/'+it.id+'/approve',{method:'POST'});load();}catch(e){alert(e.message);}};
 const save=el('button',null,'Save edits');save.onclick=async()=>{const pkg=Object.assign({},pub,{title:title.value,description:desc.value,tags:tags.value.split(',').map(s=>s.trim()).filter(Boolean),igCaption:ig.value,thumbnailText:thumb.value});try{await api('/review/'+it.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({hook:hook.value,editedBody:body.value,cta:cta.value,publishPackage:pkg})});save.textContent='Saved';}catch(e){alert(e.message);}};
 const flag=el('label');flag.style.cssText='display:flex;align-items:center;gap:5px;text-transform:none;letter-spacing:0;color:var(--mut);margin:0';
 const cb=el('input');cb.type='checkbox';flag.appendChild(cb);flag.appendChild(document.createTextNode('flag fact out'));
 const rej=el('button',null,'Reject');rej.onclick=async()=>{const reason=prompt('Reason (optional):')||undefined;try{await api('/review/'+it.id+'/reject',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reason:reason,flagFactUnit:cb.checked})});load();}catch(e){alert(e.message);}};
 act.appendChild(appr);act.appendChild(save);act.appendChild(rej);act.appendChild(flag);
 c.appendChild(act);
 return c;
}
load();
</script>
</body></html>`;
