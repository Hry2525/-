(() => {
"use strict";

const DATA = window.FE_DATA;
const ALL = [...DATA.A, ...DATA.B, ...DATA.P];
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const main = $("#main");
const badge = $("#offlineBadge");
const toastEl = $("#toast");

const STORAGE = "fe_iphone_pwa_state_v2";
const DEFAULT_STATE = {
  stats: {},
  current: null,
  flight: {outbound:false, return:false},
  lastView:"home"
};
let state = loadState();
let timerHandle = null;

function loadState(){
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE) || "null");
    return Object.assign({}, DEFAULT_STATE, s || {});
  } catch {
    return (typeof structuredClone !== "undefined") ? structuredClone(DEFAULT_STATE) : JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}
function saveState(){ localStorage.setItem(STORAGE, JSON.stringify(state)); }
function esc(s){ return String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m])); }
function toast(msg){
  toastEl.textContent = msg; toastEl.classList.add("show");
  setTimeout(()=>toastEl.classList.remove("show"), 1800);
}
function shuffle(arr){
  const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a;
}
function pct(a,b){ return b ? Math.round(a/b*100) : 0; }
function statsFor(q){
  return state.stats[q.id] || {attempts:0,correct:0,wrong:0,uncertain:false,lastAnswer:null};
}
function overall(){
  const vals=Object.values(state.stats);
  const attempts=vals.reduce((s,x)=>s+x.attempts,0);
  const correct=vals.reduce((s,x)=>s+x.correct,0);
  const wrong=vals.reduce((s,x)=>s+x.wrong,0);
  const uncertain=vals.filter(x=>x.uncertain).length;
  return {attempts,correct,wrong,uncertain,accuracy:pct(correct,attempts)};
}
function categoryPerformance(){
  const map={};
  ALL.forEach(q=>{
    const s=statsFor(q);
    if(!s.attempts) return;
    map[q.cat] ||= {a:0,c:0};
    map[q.cat].a += s.attempts; map[q.cat].c += s.correct;
  });
  return Object.entries(map).map(([cat,x])=>({cat,attempts:x.a,correct:x.c,accuracy:pct(x.c,x.a)})).sort((a,b)=>a.accuracy-b.accuracy || b.attempts-a.attempts);
}
function baseWeakness(){
  return Object.entries(DATA.profile).map(([cat,score])=>({cat,accuracy:score,source:"初期"})).sort((a,b)=>a.accuracy-b.accuracy);
}
function dynamicWeak(){
  const dyn=categoryPerformance().filter(x=>x.attempts>=2).map(x=>({...x,source:"学習履歴"}));
  const byCat=new Map(dyn.map(x=>[x.cat,x]));
  baseWeakness().forEach(x=>{ if(!byCat.has(x.cat)) byCat.set(x.cat,x); });
  return [...byCat.values()].sort((a,b)=>a.accuracy-b.accuracy).slice(0,6);
}
function view(name){
  state.lastView=name; saveState();
  $$(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
  if(timerHandle){clearInterval(timerHandle);timerHandle=null;}
  if(name==="home") renderHome();
  if(name==="flight") renderFlight();
  if(name==="weak") renderWeak();
  if(name==="mock") renderMock();
  if(name==="review") renderReview();
  window.scrollTo({top:0,behavior:"auto"});
}
$$(".nav-btn").forEach(b=>b.addEventListener("click",()=>view(b.dataset.view)));

function renderHome(){
  const o=overall(), weak=dynamicWeak();
  const doneUnique=Object.values(state.stats).filter(x=>x.attempts>0).length;
  main.innerHTML=`
    <section class="card hero">
      <div class="muted">機内モード対応 PWA</div>
      <h2 style="margin-top:4px">往復4時間で、本番力を上げる</h2>
      <p class="muted">一度オンラインで「オフライン準備完了」になれば、ホーム画面から機内モードで使えます。</p>
      <div class="kpi-row">
        <div class="kpi"><b>${doneUnique}</b><small>学習済み問題</small></div>
        <div class="kpi"><b>${o.accuracy}%</b><small>累計正答率</small></div>
        <div class="kpi"><b>${o.uncertain}</b><small>迷った問題</small></div>
      </div>
      <div class="actions">
        <button class="btn primary" id="goFlight">✈ 4時間プラン</button>
        <button class="btn ghost" id="resumeBtn">${state.current ? "続きから" : "弱点10問"}</button>
      </div>
    </section>
    <div class="section-title"><h2>優先弱点</h2><span class="chip">自動更新</span></div>
    <section class="card">
      ${weak.map(w=>`<div class="weak-item"><div><b>${esc(w.cat)}</b><div class="muted" style="font-size:12px">${w.source}</div></div><div class="score ${w.accuracy<60?"bad":w.accuracy<80?"mid":"good"}"><b>${w.accuracy}%</b></div></div>`).join("")}
    </section>
    <div class="section-title"><h2>あなた向け対策</h2></div>
    <section class="card">
      <ul class="list">${DATA.weak_notes.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
    </section>
    <div class="section-title"><h2>収録</h2></div>
    <section class="card">
      <div class="kpi-row">
        <div class="kpi"><b>${DATA.A.length}</b><small>科目A</small></div>
        <div class="kpi"><b>${DATA.B.length}</b><small>科目B</small></div>
        <div class="kpi"><b>${DATA.P.length}</b><small>IPA公開</small></div>
      </div>
      <p class="muted" style="font-size:13px">問題・解説・進捗は端末内に保存。通信なしで使用できます。</p>
    </section>
    <section class="install-note">
      <b>搭乗前に確認：</b> Safariで開き「ホーム画面に追加」→この画面右上が<b>オフライン準備完了</b>になってから機内モードへ。
    </section>
  `;
  $("#goFlight").onclick=()=>view("flight");
  $("#resumeBtn").onclick=()=> state.current ? resumeQuiz() : startWeakQuiz(10);
}
function renderFlight(){
  main.innerHTML=`
    <h2>✈ 往復4時間プラン</h2>
    <section class="card">
      <h3>往路：120分</h3>
      <div class="flight-block"><div class="minutes">15分</div><div><b>弱点ウォームアップ 10問</b><p class="muted">二重ループ・再帰・基数変換など。</p><button class="btn secondary" id="out1">開始</button></div></div>
      <div class="flight-block"><div class="minutes">90分</div><div><b>科目A 60問模試</b><p class="muted">本番と同じ時間配分。平均1.5分/問。</p><button class="btn secondary" id="out2">開始</button></div></div>
      <div class="flight-block"><div class="minutes">15分</div><div><b>誤答・迷いだけ復習</b><p class="muted">解説を読み、同型を解き直す。</p><button class="btn secondary" id="out3">開始</button></div></div>
    </section>
    <section class="card">
      <h3>復路：120分</h3>
      <div class="flight-block"><div class="minutes">100分</div><div><b>科目B 20問模試</b><p class="muted">アルゴリズム16問＋セキュリティ4問。</p><button class="btn secondary" id="ret1">開始</button></div></div>
      <div class="flight-block"><div class="minutes">20分</div><div><b>科目Bの誤答だけ再挑戦</b><p class="muted">処理途中を書いて追う。</p><button class="btn secondary" id="ret2">開始</button></div></div>
    </section>
    <section class="card">
      <h3>機内でのルール</h3>
      <ul class="list">
        <li>迷った問題は「？」をONにする。正解でも復習対象になります。</li>
        <li>科目Bは頭だけで追わず、iPhoneのメモか紙に変数・配列の途中状態を書く。</li>
        <li>模試中は解説を見ず、最後にまとめて採点する。</li>
      </ul>
    </section>`;
  $("#out1").onclick=()=>startWeakQuiz(10,15);
  $("#out2").onclick=()=>startQuiz(DATA.A,{title:"科目A 60問模試",mode:"mockA",minutes:90,exam:true});
  $("#out3").onclick=()=>startReviewQuiz(15,15);
  $("#ret1").onclick=()=>startQuiz(DATA.B,{title:"科目B 20問模試",mode:"mockB",minutes:100,exam:true});
  $("#ret2").onclick=()=>startReviewQuiz(20,20,"B");
}
function renderWeak(){
  const weak=dynamicWeak();
  main.innerHTML=`
    <h2>弱点演習</h2>
    <section class="card">
      <h3>弱点優先で出題</h3>
      <p class="muted">初期正答率と、このアプリ内の回答履歴を合わせて問題を選びます。</p>
      <div class="actions"><button class="btn primary" id="w10">10問</button><button class="btn secondary" id="w20">20問</button></div>
    </section>
    <section class="card">
      <h3>現在の下位分野</h3>
      ${weak.map(x=>`<div class="weak-item"><div><b>${esc(x.cat)}</b><div class="muted" style="font-size:12px">${x.source}</div></div><b>${x.accuracy}%</b></div>`).join("")}
    </section>
    <section class="card">
      <h3>分野を指定</h3>
      <select id="categoryPick" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:12px;background:white">
        ${[...new Set([...DATA.A,...DATA.B].map(q=>q.cat))].sort().map(c=>`<option>${esc(c)}</option>`).join("")}
      </select>
      <div class="actions"><button class="btn ghost" id="c10">10問</button><button class="btn ghost" id="c20">20問</button></div>
    </section>`;
  $("#w10").onclick=()=>startWeakQuiz(10);
  $("#w20").onclick=()=>startWeakQuiz(20);
  $("#c10").onclick=()=>startCategory($("#categoryPick").value,10);
  $("#c20").onclick=()=>startCategory($("#categoryPick").value,20);
}
function renderMock(){
  main.innerHTML=`
    <h2>本番形式</h2>
    <section class="card"><h3>科目A</h3><p>60問・90分想定。採点まで解説は表示しません。</p><button class="btn primary full" id="mockA">60問模試を開始</button></section>
    <section class="card"><h3>科目B</h3><p>20問・100分想定。アルゴリズム16問＋情報セキュリティ4問。</p><button class="btn primary full" id="mockB">20問模試を開始</button></section>
    <section class="card"><h3>2026年度 IPA公開問題</h3><p class="muted">図表依存が少ない公開問題をオフライン用に収録。</p><button class="btn secondary full" id="past">公開問題 ${DATA.P.length}問</button></section>`;
  $("#mockA").onclick=()=>startQuiz(DATA.A,{title:"科目A 60問模試",mode:"mockA",minutes:90,exam:true});
  $("#mockB").onclick=()=>startQuiz(DATA.B,{title:"科目B 20問模試",mode:"mockB",minutes:100,exam:true});
  $("#past").onclick=()=>startQuiz(DATA.P,{title:"2026年度 IPA公開問題",mode:"past",minutes:0,exam:false});
}
function reviewPool(filter){
  let pool=ALL.filter(q=>{
    const s=statsFor(q);
    const needs=s.wrong>0 || s.uncertain;
    if(!needs) return false;
    if(filter==="B") return DATA.B.some(x=>x.id===q.id);
    return true;
  });
  pool.sort((x,y)=>{const a=statsFor(x),b=statsFor(y);return Number(b.uncertain)-Number(a.uncertain) || b.wrong-a.wrong;});
  return pool;
}
function renderReview(){
  const pool=reviewPool();
  const perf=categoryPerformance();
  main.innerHTML=`
    <h2>誤答・迷いの復習</h2>
    <section class="card">
      <div class="result-grid">
        <div class="result-box"><b style="font-size:25px">${pool.length}</b><div class="muted">復習対象</div></div>
        <div class="result-box"><b style="font-size:25px">${overall().uncertain}</b><div class="muted">？付き</div></div>
      </div>
      <div class="actions"><button class="btn primary" id="r10">10問</button><button class="btn secondary" id="rAll">全部</button></div>
    </section>
    <section class="card">
      <h3>この端末での分野別成績</h3>
      ${perf.length ? perf.map(x=>`<div class="category-row"><div style="display:flex;justify-content:space-between"><b>${esc(x.cat)}</b><b>${x.accuracy}%</b></div><div class="bar"><span style="width:${x.accuracy}%"></span></div><div class="muted" style="font-size:11px">${x.correct}/${x.attempts} 正解</div></div>`).join("") : `<div class="empty">まだ回答履歴がありません。</div>`}
    </section>
    <section class="card"><button class="btn danger full" id="reset">回答履歴をリセット</button></section>`;
  $("#r10").onclick=()=>startReviewQuiz(10);
  $("#rAll").onclick=()=>startReviewQuiz(Math.max(pool.length,1));
  $("#reset").onclick=()=>{if(confirm("このiPhoneに保存した回答履歴をすべて削除しますか？")){localStorage.removeItem(STORAGE);state=JSON.parse(JSON.stringify(DEFAULT_STATE));toast("回答履歴を削除しました");renderReview();}};
}
function startWeakQuiz(n,minutes=0){
  const weakCats=dynamicWeak().map(x=>x.cat);
  let pool=[...DATA.A,...DATA.B].filter(q=>weakCats.includes(q.cat));
  const priority=pool.filter(q=>["基礎理論","アルゴリズム・プログラミング","ネットワーク","企業と法務"].includes(q.cat));
  pool=[...priority,...pool];
  startQuiz(shuffle(pool).slice(0,Math.min(n,pool.length)),{title:`弱点優先 ${n}問`,mode:"weak",minutes,exam:false});
}
function startCategory(cat,n){
  const pool=shuffle([...DATA.A,...DATA.B].filter(q=>q.cat===cat)).slice(0,n);
  startQuiz(pool,{title:`${cat} ${pool.length}問`,mode:"category",minutes:0,exam:false});
}
function startReviewQuiz(n,minutes=0,filter=null){
  const pool=reviewPool(filter);
  if(!pool.length){toast("復習対象がまだありません");return;}
  startQuiz(pool.slice(0,Math.min(n,pool.length)),{title:`誤答・迷い復習 ${Math.min(n,pool.length)}問`,mode:"review",minutes,exam:false});
}
function startQuiz(questions, opts){
  if(!questions.length){toast("出題できる問題がありません");return;}
  state.current={ids:questions.map(q=>q.id),title:opts.title,mode:opts.mode,minutes:opts.minutes||0,remaining:(opts.minutes||0)*60,exam:!!opts.exam,index:0,answers:{},flags:{},startedAt:Date.now()};
  saveState(); renderCurrentQuiz();
}
function resumeQuiz(){if(!state.current){toast("続きはありません");return;}renderCurrentQuiz();}
function getQ(id){ return ALL.find(q=>q.id===id); }
function renderCurrentQuiz(){
  const cur=state.current;
  if(!cur){view("home");return;}
  const qs=cur.ids.map(getQ).filter(Boolean);
  const q=qs[cur.index];
  const selected=cur.answers[q.id];
  const flagged=!!cur.flags[q.id];
  const prog=Math.round((cur.index)/qs.length*100);
  main.innerHTML=`
    <div class="quiz-top">
      <div class="quiz-meta"><span>${cur.index+1} / ${qs.length}</span><span id="timer" class="timer">${cur.minutes?formatTime(cur.remaining):"時間制限なし"}</span></div>
      <div class="bar"><span style="width:${prog}%"></span></div><div class="quiz-title">${esc(cur.title)}</div>
    </div>
    <section class="question-card">
      <div class="q-category">${esc(q.cat)} <span class="muted">・${esc(q.id)}</span></div>
      <div class="q-text">${esc(q.q)}</div>
      ${q.code?`<div class="code">${esc(q.code)}</div>`:""}
      <div id="options">${q.opts.map((o,i)=>`<button class="option ${selected===i?"selected":""}" data-i="${i}"><span class="letter">${String.fromCharCode(65+i)}</span><span>${esc(o)}</span></button>`).join("")}</div>
      <div class="flag-row"><span class="muted" style="font-size:12px">自信がなければ復習対象に</span><button class="flag-btn ${flagged?"on":""}" id="flagBtn">？ 迷った</button></div>
      ${(!cur.exam && selected!==undefined) ? `<div class="explain"><b>選択中：${String.fromCharCode(65+selected)}</b><div class="muted" style="font-size:12px">採点時に正解と解説を表示します。</div></div>`:""}
      ${q.src?`<div class="past-source">${esc(q.src)}</div>`:""}
    </section>
    <div class="quiz-footer">
      <button class="btn ghost" id="prev" ${cur.index===0?"disabled":""}>← 前へ</button>
      ${cur.index===qs.length-1?`<button class="btn primary" id="finish">採点する</button>`:`<button class="btn primary" id="next">次へ →</button>`}
    </div>
    <div class="actions one"><button class="btn ghost full" id="quit">中断して保存</button></div>`;
  $$(".option").forEach(b=>b.onclick=()=>{cur.answers[q.id]=Number(b.dataset.i);saveState();renderCurrentQuiz();});
  $("#flagBtn").onclick=()=>{cur.flags[q.id]=!cur.flags[q.id];saveState();renderCurrentQuiz();};
  if($("#prev")) $("#prev").onclick=()=>{cur.index--;saveState();renderCurrentQuiz();};
  if($("#next")) $("#next").onclick=()=>{cur.index++;saveState();renderCurrentQuiz();};
  if($("#finish")) $("#finish").onclick=finishQuiz;
  $("#quit").onclick=()=>{saveState();toast("続きから再開できます");view("home");};
  startTimer();
}
function startTimer(){
  if(timerHandle){clearInterval(timerHandle);timerHandle=null;}
  const cur=state.current;if(!cur || !cur.minutes) return;
  timerHandle=setInterval(()=>{
    if(!state.current){clearInterval(timerHandle);return;}
    state.current.remaining=Math.max(0,state.current.remaining-1);
    const t=$("#timer"); if(t)t.textContent=formatTime(state.current.remaining);
    if(state.current.remaining%10===0) saveState();
    if(state.current.remaining===0){clearInterval(timerHandle);toast("時間です。採点します");setTimeout(finishQuiz,500);}
  },1000);
}
function formatTime(sec){const m=Math.floor(sec/60),s=sec%60;return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;}
function finishQuiz(){
  const cur=state.current;if(!cur)return;
  if(timerHandle){clearInterval(timerHandle);timerHandle=null;}
  const qs=cur.ids.map(getQ).filter(Boolean);
  let correct=0,answered=0,flagged=0;const rows=[];
  qs.forEach(q=>{
    const ans=cur.answers[q.id],flag=!!cur.flags[q.id];
    if(flag)flagged++;
    const ok=ans!==undefined&&ans===q.a;
    if(ans!==undefined)answered++;
    if(ok)correct++;
    const st=statsFor(q);
    if(ans!==undefined){st.attempts++;if(ok)st.correct++;else st.wrong++;st.lastAnswer=ans;}
    st.uncertain=flag||(st.uncertain&&!ok);state.stats[q.id]=st;rows.push({q,ans,ok,flag});
  });
  const title=cur.title,mode=cur.mode;state.current=null;saveState();renderResults(title,rows,correct,answered,flagged,mode);
}
function renderResults(title,rows,correct,answered,flagged,mode){
  const total=rows.length,acc=pct(correct,total),cats={};
  rows.forEach(r=>{cats[r.q.cat] ||= {n:0,c:0};cats[r.q.cat].n++;if(r.ok)cats[r.q.cat].c++;});
  main.innerHTML=`
    <h2>${esc(title)} 結果</h2>
    <section class="card">
      <div class="result-score ${acc>=80?"good":acc>=60?"mid":"bad"}">${correct}/${total}</div>
      <p><b>${acc}%</b>　回答済み ${answered}/${total}　？ ${flagged}問</p>
      <div class="result-grid"><div class="result-box"><b>${rows.filter(r=>!r.ok).length}</b><div class="muted">誤答/未回答</div></div><div class="result-box"><b>${flagged}</b><div class="muted">迷った問題</div></div></div>
    </section>
    <section class="card"><h3>分野別</h3>${Object.entries(cats).map(([cat,x])=>`<div class="category-row"><div style="display:flex;justify-content:space-between"><b>${esc(cat)}</b><b>${x.c}/${x.n}</b></div><div class="bar"><span style="width:${pct(x.c,x.n)}%"></span></div></div>`).join("")}</section>
    <section>${rows.map((r,i)=>`<details ${(!r.ok||r.flag)?"open":""}><summary>${i+1}. ${r.ok?"✅":"❌"} ${esc(r.q.q).slice(0,48)}${r.q.q.length>48?"…":""}${r.flag?"　？":""}</summary><div class="inside">${r.q.code?`<div class="code">${esc(r.q.code)}</div>`:""}<p>あなた：<b>${r.ans===undefined?"未回答":String.fromCharCode(65+r.ans)}</b>　正解：<b>${String.fromCharCode(65+r.q.a)}</b></p><div class="explain">${esc(r.q.exp||"")}</div>${r.q.src?`<div class="past-source">${esc(r.q.src)}</div>`:""}</div></details>`).join("")}</section>
    <div class="actions"><button class="btn primary" id="retryWrong">誤答・？を解く</button><button class="btn ghost" id="backHome">ホーム</button></div>`;
  $("#backHome").onclick=()=>view("home");
  $("#retryWrong").onclick=()=>{const pool=rows.filter(r=>!r.ok||r.flag).map(r=>r.q);if(!pool.length){toast("復習対象はありません");return;}startQuiz(pool,{title:"このセットの復習",mode:"retry",minutes:0,exam:false});};
}
async function setupOffline(){
  if(location.protocol==="file:"){badge.textContent="Pagesで有効";badge.className="offline-badge file";return;}
  if(!("serviceWorker" in navigator)){badge.textContent="未対応";badge.className="offline-badge file";return;}
  try{await navigator.serviceWorker.register("./sw.js");await navigator.serviceWorker.ready;badge.textContent="オフライン準備完了";badge.className="offline-badge ready";}
  catch(e){badge.textContent="準備エラー";badge.className="offline-badge file";}
}
setupOffline();
view(state.lastView || "home");
})();