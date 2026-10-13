(() => {
"use strict";

const DATA = window.FE_DATA;
const CRASH = window.FE_CRASH;
const GUIDE = window.FE_GUIDE;
const EXPLAIN = window.FE_EXPLAIN || {};
const AWS = window.AWS_SAA || [];
const ALL = [...DATA.A, ...DATA.B, ...DATA.P, ...CRASH.old, ...CRASH.terms, ...CRASH.btrace, ...(CRASH.security||[]), ...(CRASH.longB||[]), ...(CRASH.longBSec||[]), ...(CRASH.examBAlgo||[]), ...(CRASH.examBSec||[]), ...(CRASH.gapBAlgo||[]), ...(CRASH.gapBSec||[]), ...AWS];
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
  history: [],
  lastView:"home"
};
let state = loadState();
state.history ||= [];
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
function isMulti(q){ return Array.isArray(q.a); }
function hasAnswer(ans){ return ans!==undefined && (!Array.isArray(ans) || ans.length>0); }
function answerCorrect(q,ans){
  if(!hasAnswer(ans)) return false;
  if(!isMulti(q)) return ans===q.a;
  if(!Array.isArray(ans) || ans.length!==q.a.length) return false;
  const x=[...ans].sort((a,b)=>a-b), y=[...q.a].sort((a,b)=>a-b);
  return x.every((v,i)=>v===y[i]);
}
function answerLabel(ans){
  if(!hasAnswer(ans)) return "未回答";
  const arr=Array.isArray(ans)?[...ans].sort((a,b)=>a-b):[ans];
  return arr.map(i=>String.fromCharCode(65+i)).join("・");
}
function statsFor(q){
  return state.stats[q.id] || {attempts:0,correct:0,wrong:0,uncertain:false,lastAnswer:null};
}
function unseenCount(pool){ return [...new Map(pool.map(q=>[q.id,q])).values()].filter(q=>!statsFor(q).attempts).length; }
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
  if(name==="guide") renderGuide();
  if(name==="crash") renderCrash();
  if(name==="dojo") renderDojo();
  if(name==="analytics") renderAnalytics();
  window.scrollTo({top:0,behavior:"auto"});
}
$$(".nav-btn").forEach(b=>b.addEventListener("click",()=>view(b.dataset.view)));


function sessionPct(x){ return x && x.total ? Math.round(x.correct/x.total*100) : null; }
function recentMode(mode,n=3){
  return (state.history||[]).filter(x=>x.mode===mode).slice(-n);
}
function avgPct(rows){
  const valid=rows.filter(x=>x && x.total);
  if(!valid.length) return null;
  return Math.round(valid.reduce((s,x)=>s+(x.correct/x.total*100),0)/valid.length);
}
function localDay(ts){
  const d=new Date(ts);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function dailyRows(){
  const map={};
  (state.history||[]).forEach(x=>{
    const k=localDay(x.at||Date.now());
    map[k] ||= {day:k,correct:0,total:0,sessions:0,durationSec:0,flagged:0};
    map[k].correct+=x.correct||0;
    map[k].total+=x.total||0;
    map[k].sessions++;
    map[k].durationSec+=x.durationSec||0;
    map[k].flagged+=x.flagged||0;
  });
  return Object.values(map).sort((a,b)=>a.day.localeCompare(b.day));
}
function readinessModel(){
  const a=avgPct(recentMode("mockA",2));
  const b=avgPct(recentMode("mockB",2));
  const crash=avgPct(recentMode("crash30",3));
  const trace=avgPct(recentMode("btrace10",3));
  const attempted=Object.values(state.stats).filter(x=>x.attempts>0).length;
  const coverage=Math.round(attempted/ALL.length*100);
  const components=[
    {name:"科目A模試",value:a,weight:30},
    {name:"科目B模試",value:b,weight:35},
    {name:"70/20/10",value:crash,weight:20},
    {name:"Bトレース",value:trace,weight:10},
    {name:"B救済",value:avgPct(recentMode("bRescue",2)),weight:5},
    {name:"網羅度",value:Math.min(100,Math.round(coverage/60*100)),weight:5}
  ];
  const available=components.filter(x=>x.value!==null);
  const weight=available.reduce((s,x)=>s+x.weight,0);
  const raw=weight?Math.round(available.reduce((s,x)=>s+x.value*x.weight,0)/weight):0;
  const coreEvidence=(a!==null?1:0)+(b!==null?1:0);
  const sessions=(state.history||[]).length;
  let confidence=sessions>=8?100:sessions>=5?75:sessions>=3?55:25;
  if(coreEvidence===0) confidence=Math.min(confidence,40);
  if(coreEvidence===1) confidence=Math.min(confidence,70);

  let label="データ不足", days=null;
  if(sessions>=3){
    if(raw>=80 && a!==null && b!==null) label="受験圏内";
    else if(raw>=75) label="かなり近い";
    else if(raw>=70){label="あと少し";days="2〜4日";}
    else if(raw>=60){label="重点補強中";days="4〜7日";}
    else {label="基礎固め優先";days="7日以上";}
  }

  const ds=dailyRows().slice(-5);
  let trend=null;
  if(ds.length>=2){
    const first=ds[0].total?ds[0].correct/ds[0].total*100:0;
    const last=ds[ds.length-1].total?ds[ds.length-1].correct/ds[ds.length-1].total*100:0;
    trend=Math.round((last-first)*10)/10;
  }
  return {score:raw,label,days,confidence,coverage,attempted,components,trend};
}
function todaySummary(){
  const key=localDay(Date.now());
  const d=dailyRows().find(x=>x.day===key) || {correct:0,total:0,sessions:0,durationSec:0,flagged:0};
  return {...d,accuracy:pct(d.correct,d.total)};
}
function formatMinutes(sec){ return sec?Math.max(1,Math.round(sec/60))+"分":"—"; }

function renderHome(){
  const o=overall(), weak=dynamicWeak();
  const ready=readinessModel(), today=todaySummary();
  const doneUnique=Object.values(state.stats).filter(x=>x.attempts>0).length;
  main.innerHTML=`
    <section class="card hero">
      <div class="muted">機内モード対応 PWA</div>
      <h2 style="margin-top:4px">FE再受験＋AWS SAAを毎日回す</h2>
      <p class="muted">FEは初見・穴埋め耐性、AWSは本番シナリオ型を重視。毎日両方に触れます。</p>
      <div class="kpi-row">
        <div class="kpi"><b>${doneUnique}</b><small>学習済み問題</small></div>
        <div class="kpi"><b>${o.accuracy}%</b><small>累計正答率</small></div>
        <div class="kpi"><b>${o.uncertain}</b><small>迷った問題</small></div>
      </div>
      <div class="actions">
        <button class="btn primary" id="goCrash">🔥 直前7日モード</button>
        <button class="btn ghost" id="resumeBtn">${state.current ? "続きから" : "弱点10問"}</button>
      </div>
      <div class="actions one"><button class="btn secondary full" id="goFlight">✈ 飛行機4時間プラン</button></div>
    </section>

    <section class="card readiness-card">
      <div class="section-title" style="margin-top:0"><h2>合格準備度</h2><span class="chip">推定</span></div>
      <div class="readiness-main"><b>${ready.score}%</b><span>${esc(ready.label)}</span></div>
      <div class="bar"><span style="width:${Math.min(100,ready.score)}%"></span></div>
      <div class="kpi-row">
        <div class="kpi"><b>${ready.coverage}%</b><small>問題網羅度</small></div>
        <div class="kpi"><b>${ready.confidence}%</b><small>判定信頼度</small></div>
        <div class="kpi"><b>${ready.days||'—'}</b><small>目安</small></div>
      </div>
      <p class="muted" style="font-size:12px">合格確率ではありません。直近のA/B模試・70/20/10・Bトレース・網羅度から算出する学習指標です。</p>
      <button class="btn ghost full" id="goAnalytics">毎日の成果を見る</button>
    </section>

    <section class="card daily-mix-card">
      <div class="section-title" style="margin-top:0"><h2>今日の日課｜FE＋AWS</h2><span class="chip">${todayCompleted("dailyMix")?"完了":"40問"}</span></div>
      <div class="daily-plan-grid">
        <div><b>FE A 10</b><small>全分野</small></div>
        <div><b>FE B 10</b><small>穴埋め中心</small></div>
        <div><b>AWS 20</b><small>4ドメイン</small></div>
      </div>
      <p class="muted" style="font-size:12px">同じ得意問題だけに偏らず、未回答・誤答・弱点を優先して毎日組み直します。</p>
      <button class="btn primary full" id="dailyMix">${todayCompleted("dailyMix")?"今日の日課をもう一度":"今日の40問を開始"}</button>
      <button class="btn secondary full" id="unseenMix" style="margin-top:8px">初見耐性60問（FE A20 / B20 / AWS20）</button>
    </section>

    <section class="card">
      <h3>今日の成果</h3>
      <div class="kpi-row">
        <div class="kpi"><b>${today.total}</b><small>解答数</small></div>
        <div class="kpi"><b>${today.accuracy}%</b><small>正答率</small></div>
        <div class="kpi"><b>${formatMinutes(today.durationSec)}</b><small>計測学習時間</small></div>
      </div>
      <div class="actions"><button class="btn primary" id="goDojo">🥋 道場型演習</button><button class="btn secondary" id="goAnalytics2">成績分析</button></div>
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
        <div class="kpi"><b>${feBPool().length}</b><small>科目B</small></div>
        <div class="kpi"><b>${AWS.length}</b><small>AWS SAA</small></div>
      </div>
      <p class="muted" style="font-size:13px">問題・解説・進捗は端末内に保存。通信なしで使用できます。</p>
      <p class="muted" style="font-size:13px"><b>総問題バンク：${ALL.length}問</b>（FE＋AWS）。AWS：${AWS.length}問 / FE B穴埋め：${(CRASH.gapBAlgo||[]).length+(CRASH.gapBSec||[]).length}問。</p>
      <div class="kpi-row">
        <div class="kpi"><b>${unseenCount(DATA.A)}</b><small>A 未回答</small></div>
        <div class="kpi"><b>${unseenCount(feBPool())}</b><small>B 未回答</small></div>
        <div class="kpi"><b>${unseenCount(AWS)}</b><small>AWS 未回答</small></div>
      </div>
    </section>
    <section class="install-note">
      <b>搭乗前に確認：</b> Safariで開き「ホーム画面に追加」→この画面右上が<b>オフライン準備完了</b>になってから機内モードへ。
    </section>
  `;
  $("#dailyMix").onclick=startDailyMix;
  $("#unseenMix").onclick=()=>startQuiz(buildUnseenMix(),{title:"初見耐性60問",mode:"unseen60",minutes:120,exam:false});
  $("#goCrash").onclick=()=>view("crash");
  $("#goFlight").onclick=()=>view("flight");
  $("#goDojo").onclick=()=>view("dojo");
  $("#goAnalytics").onclick=()=>view("analytics");
  $("#goAnalytics2").onclick=()=>view("analytics");
  $("#resumeBtn").onclick=()=> state.current ? resumeQuiz() : startWeakQuiz(10);
}
function pickAdaptive(pool,n){
  const uniq=[...new Map(pool.map(q=>[q.id,q])).values()];
  const weakCats=new Set(dynamicWeak().map(x=>x.cat));
  return uniq
    .map(q=>{
      const s=statsFor(q);
      let score=Math.random();
      if(s.wrong>s.correct) score+=4;
      if(s.uncertain) score+=3;
      if(weakCats.has(q.cat)) score+=2;
      if(!s.attempts) score+=1;
      if(q.src || q.id.startsWith("P-") || q.id.startsWith("O")) score+=0.8;
      return {q,score};
    })
    .sort((a,b)=>b.score-a.score)
    .slice(0,Math.min(n,uniq.length))
    .map(x=>x.q);
}
function buildCrashMix(n=30){
  const currentCount=Math.round(n*0.7);
  const oldCount=Math.round(n*0.2);
  const termCount=n-currentCount-oldCount;
  const bCount=Math.max(1,Math.round(currentCount/3));
  const aCount=currentCount-bCount;
  const currentA=pickAdaptive([...DATA.A,...DATA.P.filter(q=>q.cat.includes("科目A"))],aCount);
  const currentB=pickAdaptive([...DATA.B,...DATA.P.filter(q=>q.cat.includes("科目B")),...CRASH.btrace,...(CRASH.security||[]),...(CRASH.gapBAlgo||[]),...(CRASH.gapBSec||[])],bCount);
  const old=pickAdaptive(CRASH.old,oldCount);
  const terms=pickAdaptive(CRASH.terms,termCount);
  return shuffle([...currentA,...currentB,...old,...terms]);
}
function latestPass(mode,minPct,count=2){
  const rows=(state.history||[]).filter(x=>x.mode===mode).slice(-count);
  return rows.length===count && rows.every(x=>pct(x.correct,x.total)>=minPct);
}
function readiness(){
  const gates=[
    {name:"70/20/10 30問",ok:latestPass("crash30",80,2),target:"24/30以上を2回"},
    {name:"科目Bトレース10問",ok:latestPass("btrace10",80,2),target:"8/10以上を2回"},
    {name:"科目A模試",ok:latestPass("mockA",80,2),target:"48/60以上を2回"},
    {name:"科目B模試",ok:latestPass("mockB",80,2),target:"16/20以上を2回"}
  ];
  return {gates,passed:gates.filter(x=>x.ok).length};
}
function startCrash30(){
  startQuiz(buildCrashMix(30),{title:"直前 70/20/10・30問",mode:"crash30",minutes:50,exam:false});
}
function startBTrace10(){
  startQuiz(pickAdaptive(CRASH.btrace,10),{title:"科目B トレース10問",mode:"btrace10",minutes:45,exam:false});
}
function buildBRescue(){
  const ids=["C-B10","C-B02","C-B05","C-B06","C-B17","LB01","LB02","LB03","LB06","LB11"];
  return ids.map(id=>ALL.find(q=>q.id===id)).filter(Boolean);
}
function renderBRescueIntro(){
  main.innerHTML=`
    <h2>🛟 科目B救済モード</h2>
    <section class="card hero">
      <div class="muted">今回の3/10から逆算</div>
      <h2 style="margin-top:4px">全部やり直さず、7パターンだけ直す</h2>
      <p class="muted">本番20問すべてが今回の10問と同じ難度ではありません。まず「読めば取れる問題」を増やします。</p>
      <button class="btn primary full" id="rescueStart">救済10問を開始</button>
    </section>

    <section class="card">
      <h3>今回の優先順位</h3>
      <div class="day-row"><b>①</b><span><b>2分探索</b>：low / high / mid の3つだけ表に書く。</span></div>
      <div class="day-row"><b>②</b><span><b>merge</b>：主ループ終了後「どちらが何個残ったか」を見る。</span></div>
      <div class="day-row"><b>③</b><span><b>2次元配列</b>：r[j,i]なら行列を入れ替える。式を日本語に直す。</span></div>
      <div class="day-row"><b>④</b><span><b>木の走査</b>：先行=根左右、中間=左根右、後行=左右根。</span></div>
      <div class="day-row"><b>⑤</b><span><b>DP</b>：配列全体を追わず「今回更新される添字」だけ追う。</span></div>
      <div class="day-row"><b>⑥</b><span><b>数理/類似度</b>：問題文の式へ数字を代入するだけ。意味を全部理解しなくてよい。</span></div>
      <div class="day-row"><b>⑦</b><span><b>長文読解</b>：設問→空欄前後→必要な本文、の順で読む。</span></div>
    </section>

    <section class="card">
      <h3>今日の目標</h3>
      <p><b>救済10問で7/10以上</b>を目標にします。達成したら本番長文10問へ戻ります。</p>
      <p class="muted">3/10からいきなり20問模試へ戻るより、こちらの方が火曜日までの伸びが速いです。</p>
    </section>`;
  $("#rescueStart").onclick=()=>startQuiz(buildBRescue(),{title:"科目B 救済10問",mode:"bRescue",minutes:45,exam:false});
}

function renderCrash(){
  const r=readiness();
  main.innerHTML=`
    <h2>🔥 直前7日・合格モード</h2>
    <section class="card hero">
      <div class="muted">受験まで1週間前後</div>
      <h2 style="margin-top:4px">70 / 20 / 10 に固定</h2>
      <div class="kpi-row">
        <div class="kpi"><b>70%</b><small>現行＋Bトレース</small></div>
        <div class="kpi"><b>20%</b><small>旧午前頻出</small></div>
        <div class="kpi"><b>10%</b><small>初見用語</small></div>
      </div>
      <div class="actions"><button class="btn primary" id="crash30">今日の30問</button><button class="btn ghost" id="btrace10">Bトレース10問</button></div>
      <div class="actions one"><button class="btn secondary full" id="rescueB">🛟 科目B救済モード</button></div>
      <div class="actions one"><button class="btn ghost full" id="longB10">B本番長文10問</button></div>
    </section>

    <section class="card">
      <h3>受験前の安全ライン</h3>
      <p class="muted">本試験はIRTなので単純正答率＝評価点ではありません。ここでは合格基準より余裕を持たせる練習基準として80%を置いています。</p>
      ${r.gates.map(g=>`<div class="weak-item"><div><b>${g.ok?"✅":"⬜"} ${esc(g.name)}</b><div class="muted" style="font-size:12px">${esc(g.target)}</div></div><b>${g.ok?"達成":"未達"}</b></div>`).join("")}
      <div class="bar"><span style="width:${r.passed/4*100}%"></span></div>
      <p><b>${r.passed}/4</b> 達成</p>
    </section>

    <section class="card">
      <h3>7日プラン</h3>
      <div class="day-row"><b>土曜</b><span>B本番長文10問 → 解説復習。短問より長文の読み方に慣れる。</span></div>
      <div class="day-row"><b>日曜</b><span>科目B 本番長文20問を100分 → 全誤答復習 → ネットワーク10問。</span></div>
      <div class="day-row"><b>月曜</b><span>科目B 本番長文20問をもう1回 → 科目A 30〜60問。新分野には手を広げない。</span></div>
      <div class="day-row"><b>火曜</b><span>試験当日は軽い確認だけ。Bの長文を新しく解かず、誤答メモと頻出論点を確認。</span></div>
    </section>

    <section class="card">
      <h3>すぐ開始</h3>
      <div class="actions"><button class="btn secondary" id="crashA">科目A 60問</button><button class="btn secondary" id="crashB">科目B 20問</button></div>
      <div class="actions"><button class="btn ghost" id="crashReview">誤答10問</button><button class="btn ghost" id="crashFlight">✈ 4時間プラン</button></div>
    </section>

    <section class="card">
      <h3>来週受験なら捨てるもの</h3>
      <ul class="list">
        <li>現行シラバス外・旧午後の個別言語問題を深追いしない。</li>
        <li>初見の細かい用語を全部暗記しようとしない。10%枠だけで触れる。</li>
        <li>科目Bは解説を読むだけにしない。必ず値を追って解く。</li>
        <li>正解したが勘だった問題は「？」を付けて復習対象にする。</li>
      </ul>
    </section>

    <section class="install-note"><b>48時間しかない場合：</b> 科目A模試1回 → 科目B模試1回 → 全誤答 → Bトレース10問 → もう一度30問、の順に絞ってください。</section>
  `;
  $("#crash30").onclick=startCrash30;
  $("#btrace10").onclick=startBTrace10;
  $("#rescueB").onclick=renderBRescueIntro;
  $("#longB10").onclick=()=>startQuiz(pickAdaptive([...(CRASH.longB||[]),...(CRASH.longBSec||[])],10),{title:"科目B 本番長文10問",mode:"bLong10",minutes:50,exam:false});
  $("#crashA").onclick=()=>startQuiz(buildMockA(),{title:"科目A 60問模試",mode:"mockA",minutes:90,exam:true});
  $("#crashB").onclick=()=>startQuiz(buildMockBReal(),{title:"科目B 本番長文20問",mode:"mockB",minutes:100,exam:true});
  $("#crashReview").onclick=()=>startReviewQuiz(10);
  $("#crashFlight").onclick=()=>view("flight");
}


function dojoPool(source){
  if(source==="current") return [...DATA.A,...DATA.B,...DATA.P,...CRASH.btrace,...(CRASH.security||[]),...(CRASH.gapBAlgo||[]),...(CRASH.gapBSec||[])];
  if(source==="official") return [...DATA.P];
  if(source==="legacy") return [...CRASH.old];
  if(source==="terms") return [...CRASH.terms];
  if(source==="gapb") return [...(CRASH.gapBAlgo||[]),...(CRASH.gapBSec||[])];
  if(source==="aws") return [...AWS];
  return [...ALL];
}
function filterByHistory(pool,mode){
  if(mode==="unanswered") return pool.filter(q=>!statsFor(q).attempts);
  if(mode==="wrong") return pool.filter(q=>statsFor(q).wrong>0);
  if(mode==="uncertain") return pool.filter(q=>statsFor(q).uncertain);
  return pool;
}
function renderDojo(){
  const categories=[...new Set(ALL.map(q=>q.cat))].sort();
  main.innerHTML=`
    <h2>🥋 道場型演習</h2>
    <section class="card">
      <p class="muted">過去問道場の「出題範囲を選ぶ→ランダム演習→履歴から復習」の考え方を、今月受験向けに現行問題優先で再構成しています。</p>
      <label class="field-label">出題ソース</label>
      <select id="dojoSource" class="study-select">
        <option value="current">現行優先（おすすめ）</option>
        <option value="official">IPA公開問題</option>
        <option value="legacy">旧午前・頻出のみ</option>
        <option value="terms">初見用語</option>
        <option value="gapb">FE科目B 穴埋め・初見コード</option>
        <option value="aws">AWS SAA</option>
        <option value="all">全問題</option>
      </select>
      <label class="field-label">分野</label>
      <select id="dojoCat" class="study-select"><option value="ALL">全分野</option>${categories.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select>
      <label class="field-label">履歴条件</label>
      <select id="dojoHistory" class="study-select">
        <option value="all">すべて</option>
        <option value="unanswered">未回答のみ</option>
        <option value="wrong">過去に間違えた問題</option>
        <option value="uncertain">「？」を付けた問題</option>
      </select>
      <label class="field-label">問題数</label>
      <select id="dojoCount" class="study-select"><option>10</option><option selected>20</option><option>30</option><option>60</option></select>
      <button class="btn primary full" id="dojoStart" style="margin-top:12px">出題開始</button>
    </section>
    <section class="card">
      <h3>直前向けショートカット</h3>
      <div class="actions"><button class="btn secondary" id="dojoCurrent20">現行20問</button><button class="btn secondary" id="dojoUnanswered">未回答10問</button></div>
      <div class="actions"><button class="btn ghost" id="dojoWrong">誤答10問</button><button class="btn ghost" id="dojoB">科目B 20問</button></div>
    </section>`;

  $("#dojoStart").onclick=()=>{
    const source=$("#dojoSource").value,cat=$("#dojoCat").value,h=$("#dojoHistory").value,n=Number($("#dojoCount").value);
    let pool=dojoPool(source);
    if(cat!=="ALL") pool=pool.filter(q=>q.cat===cat);
    pool=filterByHistory(pool,h);
    if(!pool.length){toast("条件に合う問題がありません");return;}
    startQuiz(pickAdaptive(pool,n),{title:"道場型演習 "+Math.min(n,pool.length)+"問",mode:"dojo",minutes:0,exam:false});
  };
  $("#dojoCurrent20").onclick=()=>startQuiz(pickAdaptive(dojoPool("current"),20),{title:"現行優先20問",mode:"dojo",minutes:0,exam:false});
  $("#dojoUnanswered").onclick=()=>{
    const p=filterByHistory(dojoPool("current"),"unanswered"); if(!p.length){toast("未回答はありません");return;}
    startQuiz(pickAdaptive(p,10),{title:"未回答10問",mode:"dojo",minutes:0,exam:false});
  };
  $("#dojoWrong").onclick=()=>{
    const p=filterByHistory(ALL,"wrong"); if(!p.length){toast("誤答履歴がありません");return;}
    startQuiz(pickAdaptive(p,10),{title:"誤答10問",mode:"dojo",minutes:0,exam:false});
  };
  $("#dojoB").onclick=()=>startQuiz(buildMockBReal(),{title:"科目B 本番長文20問",mode:"mockB",minutes:100,exam:true});
}

function renderAnalytics(){
  const r=readinessModel(), days=dailyRows().slice(-7).reverse(), today=todaySummary();
  const weak=dynamicWeak().slice(0,5);
  const comps=r.components;
  const latestA=avgPct(recentMode("mockA",2)),latestB=avgPct(recentMode("mockB",2)),latestAWS=avgPct(recentMode("mockAWS",2));
  main.innerHTML=`
    <h2>成績・合格準備度</h2>
    <section class="card hero">
      <div class="muted">直近成績からの推定</div>
      <div class="readiness-main light"><b>${r.score}%</b><span>${esc(r.label)}</span></div>
      <p class="muted">判定信頼度 ${r.confidence}%　網羅度 ${r.coverage}%</p>
      ${r.days?`<p><b>現在の目安：</b>${esc(r.days)}程度の重点補強</p>`:"<p>まずA/B模試と30問セットを各1回ずつ解くと判定精度が上がります。</p>"}
    </section>

    <section class="card">
      <h3>判定内訳</h3>
      ${comps.map(c=>`<div class="category-row"><div style="display:flex;justify-content:space-between"><b>${esc(c.name)}</b><b>${c.value===null?'未実施':c.value+'%'}</b></div>${c.value!==null?`<div class="bar"><span style="width:${Math.min(100,c.value)}%"></span></div>`:''}</div>`).join("")}
      <p class="muted" style="font-size:12px">目標は直前演習で80%以上を安定させること。IRT採点のため、この数値を本試験の得点や合格確率とは扱いません。</p>
    </section>

    <section class="card">
      <h3>今日</h3>
      <div class="kpi-row">
        <div class="kpi"><b>${today.total}</b><small>問題</small></div>
        <div class="kpi"><b>${today.accuracy}%</b><small>正答率</small></div>
        <div class="kpi"><b>${formatMinutes(today.durationSec)}</b><small>時間</small></div>
      </div>
    </section>

    <section class="card">
      <h3>直近7日</h3>
      ${days.length?days.map(d=>`<div class="daily-row"><div><b>${d.day.slice(5)}</b><div class="muted">${d.sessions}セット・${d.total}問・${formatMinutes(d.durationSec)}</div></div><div class="daily-score">${pct(d.correct,d.total)}%</div></div>`).join(""):'<div class="empty">まだ日別データがありません。</div>'}
    </section>

    <section class="card">
      <h3>弱点 Top5</h3>
      ${weak.map(w=>`<div class="weak-item"><div><b>${esc(w.cat)}</b><div class="muted" style="font-size:12px">${w.source}</div></div><b>${w.accuracy}%</b></div>`).join("")}
    </section>

    <section class="card">
      <h3>受験判断</h3>
      <ul class="list">
        <li>科目A直近2回：<b>${latestA===null?'未実施':latestA+'%'}</b></li>
        <li>科目B直近2回：<b>${latestB===null?'未実施':latestB+'%'}</b></li>
        <li>AWS SAA直近2回：<b>${latestAWS===null?'未実施':latestAWS+'%'}</b></li>
        <li>A/Bとも80%前後を2回続けて取れれば、かなり余裕を持った状態。</li>
        <li>70〜79%なら受験は見えるが、誤答分野を2〜4日集中補強。</li>
        <li>70%未満なら、受験日まで毎日30問＋Bトレースを優先。</li>
      </ul>
      <div class="actions"><button class="btn primary" id="analyticsCrash">今日の30問</button><button class="btn secondary" id="analyticsDojo">道場型演習</button></div>
    </section>`;
  $("#analyticsCrash").onclick=startCrash30;
  $("#analyticsDojo").onclick=()=>view("dojo");
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
  $("#out2").onclick=()=>startQuiz(buildMockA(),{title:"科目A 60問模試",mode:"mockA",minutes:90,exam:true});
  $("#out3").onclick=()=>startReviewQuiz(15,15);
  $("#ret1").onclick=()=>startQuiz(buildMockBReal(),{title:"科目B 本番長文20問",mode:"mockB",minutes:100,exam:true});
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
        ${[...new Set(corePracticePool().map(q=>q.cat))].sort().map(c=>`<option>${esc(c)}</option>`).join("")}
      </select>
      <div class="actions"><button class="btn ghost" id="c10">10問</button><button class="btn ghost" id="c20">20問</button></div>
    </section>`;
  $("#w10").onclick=()=>startWeakQuiz(10);
  $("#w20").onclick=()=>startWeakQuiz(20);
  $("#c10").onclick=()=>startCategory($("#categoryPick").value,10);
  $("#c20").onclick=()=>startCategory($("#categoryPick").value,20);
}

function aFamily(q){
  if(["プロジェクト管理","サービス管理","システム監査"].includes(q.cat)) return "management";
  if(["システム戦略","システム企画","経営戦略","ビジネスインダストリ","企業と法務"].includes(q.cat)) return "strategy";
  return "technology";
}
function buildMockA(){
  const tech=shuffle(DATA.A.filter(q=>aFamily(q)==="technology")).slice(0,41);
  const mgmt=shuffle(DATA.A.filter(q=>aFamily(q)==="management")).slice(0,7);
  const strat=shuffle(DATA.A.filter(q=>aFamily(q)==="strategy")).slice(0,12);
  return [...tech,...mgmt,...strat];
}
function buildMockB(){
  const algo=[...DATA.B.filter(q=>q.cat==="アルゴリズム・プログラミング"),...CRASH.btrace,...(CRASH.examBAlgo||[])];
  const sec=[...DATA.B.filter(q=>q.cat==="情報セキュリティ"),...(CRASH.security||[]),...(CRASH.examBSec||[])];
  return [...pickAdaptive(algo,16),...pickAdaptive(sec,4)];
}
function buildMockBReal(){
  const gapAlgo=[...(CRASH.gapBAlgo||[])];
  const gapSec=[...(CRASH.gapBSec||[])];
  const otherAlgo=[...DATA.B.filter(q=>q.cat==="アルゴリズム・プログラミング"),...CRASH.btrace,...(CRASH.longB||[]),...(CRASH.examBAlgo||[])];
  const otherSec=[...DATA.B.filter(q=>q.cat==="情報セキュリティ"),...(CRASH.security||[]),...(CRASH.longBSec||[]),...(CRASH.examBSec||[])];
  const a1=pickAdaptive(gapAlgo,14);
  const usedA=new Set(a1.map(q=>q.id));
  const a2=pickAdaptive(otherAlgo.filter(q=>!usedA.has(q.id)),2);
  const s1=pickAdaptive(gapSec,3);
  const usedS=new Set(s1.map(q=>q.id));
  const s2=pickAdaptive(otherSec.filter(q=>!usedS.has(q.id)),1);
  return shuffle([...a1,...a2,...s1,...s2]);
}
function awsByDomain(domain){ return AWS.filter(q=>q.domain===domain); }
function buildAwsPractice20(){
  return shuffle([
    ...pickUnseenBroad(awsByDomain("secure"),6),
    ...pickUnseenBroad(awsByDomain("resilient"),5),
    ...pickUnseenBroad(awsByDomain("performance"),5),
    ...pickUnseenBroad(awsByDomain("cost"),4)
  ]);
}
function buildAwsMock(){
  return shuffle([
    ...pickAdaptive(awsByDomain("secure"),20),
    ...pickAdaptive(awsByDomain("resilient"),17),
    ...pickAdaptive(awsByDomain("performance"),15),
    ...pickAdaptive(awsByDomain("cost"),13)
  ]);
}
function pickUnseenBroad(pool,n){
  const groups=new Map();
  [...new Map(pool.map(q=>[q.id,q])).values()].forEach(q=>{
    const key=q.cat||q.domain||"その他";
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(q);
  });
  const picked=[], used=new Set();
  const cats=shuffle([...groups.keys()]);
  for(const cat of cats){
    if(picked.length>=n) break;
    const candidates=groups.get(cat).sort((a,b)=>{
      const sa=statsFor(a),sb=statsFor(b);
      return (sa.attempts-sb.attempts) || (sb.wrong-sa.wrong) || Math.random()-.5;
    });
    const q=candidates.find(x=>!used.has(x.id));
    if(q){picked.push(q);used.add(q.id);}
  }
  if(picked.length<n){
    const rest=pool.filter(q=>!used.has(q.id)).sort((a,b)=>statsFor(a).attempts-statsFor(b).attempts || Math.random()-.5);
    for(const q of rest){if(picked.length>=n)break;picked.push(q);used.add(q.id);}
  }
  return picked;
}
function buildUnseenMix(){
  return shuffle([
    ...pickUnseenBroad(DATA.A,20),
    ...pickUnseenBroad([...(CRASH.gapBAlgo||[]),...(CRASH.gapBSec||[])],20),
    ...pickUnseenBroad(AWS,20)
  ]);
}
function buildDailyMix(){
  return shuffle([
    ...pickUnseenBroad(DATA.A,10),
    ...pickUnseenBroad([...(CRASH.gapBAlgo||[])],8),
    ...pickUnseenBroad([...(CRASH.gapBSec||[])],2),
    ...buildAwsPractice20()
  ]);
}
function startDailyMix(){
  startQuiz(buildDailyMix(),{title:"毎日ルーティン FE＋AWS 40問",mode:"dailyMix",minutes:85,exam:false});
}
function todayCompleted(mode){
  const today=localDay(Date.now());
  return (state.history||[]).some(x=>x.mode===mode && localDay(x.at)===today);
}
function renderGuide(){
  main.innerHTML=`
    <h2>出題範囲・傾向</h2>
    <section class="card">
      <div class="chip">更新 ${esc(GUIDE.updated)}</div>
      <h3 style="margin-top:10px">現行FEの基本仕様</h3>
      <div class="guide-two">
        <div class="result-box"><b>科目A</b><div>${GUIDE.exam.A.time} / ${GUIDE.exam.A.questions}</div><div class="muted">${GUIDE.exam.A.format}・評価${GUIDE.exam.A.scored}</div><div class="muted">${GUIDE.exam.A.target}</div></div>
        <div class="result-box"><b>科目B</b><div>${GUIDE.exam.B.time} / ${GUIDE.exam.B.questions}</div><div class="muted">${GUIDE.exam.B.format}・評価${GUIDE.exam.B.scored}</div><div class="muted">${GUIDE.exam.B.target}</div></div>
      </div>
      <div class="install-note" style="margin-top:12px">${esc(GUIDE.officialNote)}</div>
    </section>

    <section class="card aws-card">
      <h3>SAA-C03 本番仕様</h3>
      <div class="guide-two">
        <div class="result-box"><b>130分</b><div class="muted">65問</div></div>
        <div class="result-box"><b>択一＋複数選択</b><div class="muted">合格スケール 720 / 1000</div></div>
      </div>
      <div class="category-row"><div style="display:flex;justify-content:space-between"><b>セキュアな設計</b><b>30%</b></div></div>
      <div class="category-row"><div style="display:flex;justify-content:space-between"><b>レジリエントな設計</b><b>26%</b></div></div>
      <div class="category-row"><div style="display:flex;justify-content:space-between"><b>高パフォーマンス</b><b>24%</b></div></div>
      <div class="category-row"><div style="display:flex;justify-content:space-between"><b>コスト最適化</b><b>20%</b></div></div>
      <p class="muted" style="font-size:12px">AWS公式SAA-C03試験ガイド準拠。模試はこの比率に近づけて65問を構成します。</p>
    </section>

    <section class="card">
      <h3>科目A 模試配分</h3>
      ${GUIDE.aDistribution.map(x=>`<div class="weak-item"><div><b>${esc(x.name)}</b><div class="muted" style="font-size:12px">${esc(x.range)}</div></div><div style="text-align:right"><b>${x.count}問</b><div class="muted" style="font-size:11px">${x.ratio}</div></div></div>`).join("")}
      <p class="muted" style="font-size:12px">このアプリの科目A模試は毎回この41/7/12配分で60問を組みます。中分類別の問題数はIPA非公表のため、下記は学習用目安です。</p>
    </section>

    <div class="section-title"><h2>科目A：23中分類</h2><span class="chip">Ver.9.2</span></div>
    <section>
      ${GUIDE.taxonomy.map(x=>`<details class="guide-detail"><summary><span>${esc(x.middle)}</span><span class="guide-count">${esc(x.count)}</span></summary><div class="inside"><div class="muted">${esc(x.major)}</div><p>${esc(x.topics)}</p></div></details>`).join("")}
    </section>

    <div class="section-title"><h2>科目B：出題範囲</h2><span class="chip">16 + 4</span></div>
    <section class="card">
      ${GUIDE.bScope.map(x=>`<div class="category-row"><b>${esc(x.name)}</b><div class="muted">${esc(x.body)}</div></div>`).join("")}
    </section>

    <section class="card">
      <h3>アルゴリズム問題の問われ方</h3>
      <ul class="list">${GUIDE.bPatterns.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
    </section>
    <section class="card">
      <h3>科目B 頻出テーマ</h3>
      <ul class="list compact-list">${GUIDE.bThemes.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
    </section>

    <section class="card">
      <h3>IPA擬似言語ルール</h3>
      <ul class="list compact-list">${GUIDE.pseudoRules.map(x=>`<li><code>${esc(x)}</code></li>`).join("")}</ul>
      <p class="muted" style="font-size:12px">科目Bの追加問題はPython/C/Java表記を混ぜず、この記法へ統一する方針です。</p>
    </section>

    <section class="card">
      <h3>問題作成ルール</h3>
      <ol class="list compact-list">${GUIDE.questionRules.map(x=>`<li>${esc(x)}</li>`).join("")}</ol>
      <div class="guide-three">${GUIDE.difficulty.map(x=>`<div class="result-box"><b>${esc(x.name)} ${x.ratio}</b><div class="muted">A：${esc(x.A)}</div><div class="muted">B：${esc(x.B)}</div></div>`).join("")}</div>
    </section>

    <section class="card">
      <h3>2026年9月時点の最新動向</h3>
      <ul class="list">${GUIDE.latest.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
    </section>

    <section class="card">
      <h3>あなたの重点対策</h3>
      <ul class="list">${DATA.weak_notes.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>
      <button class="btn primary full" id="guideWeak">この弱点から10問解く</button>
    </section>`;
  $("#guideWeak").onclick=()=>startWeakQuiz(10);
}

function renderMock(){
  main.innerHTML=`
    <h2>本番形式</h2>
    <section class="card"><h3>FE 科目A</h3><p>60問・90分。テクノロジ41＋マネジメント7＋ストラテジ12。</p><button class="btn primary full" id="mockA">科目A 60問模試</button></section>
    <section class="card"><h3>FE 科目B｜穴埋め重視</h3><p>20問・100分。今回の本番経験を反映し、初見仕様・穴埋めを大半にして16問アルゴリズム＋4問セキュリティ。</p><button class="btn primary full" id="mockB">科目B 20問模試</button></section>
    <section class="card aws-card"><h3>AWS SAA-C03</h3><p>65問・130分。択一＋複数選択。公式4ドメイン比率に近い構成。</p><button class="btn primary full" id="mockAWS">SAA 65問模試</button><div class="actions"><button class="btn secondary" id="aws20">SAA 20問</button><button class="btn ghost" id="gapB20">FE B穴埋め20問</button></div></section>
    <section class="card"><h3>科目A 幅広60問セット</h3><p>初見用語・別論点を増やした追加60問。今回の590点から600超えを狙う補強セット。</p><button class="btn secondary full" id="mockAWide">幅広60問セット</button></section>
    <section class="card"><h3>科目A 追加固定セット</h3><p>以前追加した60問を同じ順で反復できます。</p><button class="btn ghost full" id="mockAPlus">追加60問セット</button></section>
    <section class="card"><h3>2026年度 IPA公開問題</h3><p class="muted">公開済み問題で実際の論点を確認。</p><button class="btn secondary full" id="past">公開問題 ${DATA.P.length}問</button></section>`;
  $("#mockA").onclick=()=>startQuiz(buildMockA(),{title:"FE 科目A 60問模試",mode:"mockA",minutes:90,exam:true});
  $("#mockB").onclick=()=>startQuiz(buildMockBReal(),{title:"FE 科目B 穴埋め重視20問",mode:"mockB",minutes:100,exam:true});
  $("#mockAWS").onclick=()=>startQuiz(buildAwsMock(),{title:"AWS SAA-C03 65問模試",mode:"mockAWS",minutes:130,exam:true});
  $("#aws20").onclick=()=>startQuiz(buildAwsPractice20(),{title:"AWS SAA 本番形式20問",mode:"aws20",minutes:40,exam:false});
  $("#gapB20").onclick=()=>startQuiz(pickAdaptive([...(CRASH.gapBAlgo||[]),...(CRASH.gapBSec||[])],20),{title:"FE B 穴埋め20問",mode:"gapB20",minutes:100,exam:false});
  $("#mockAWide").onclick=()=>startQuiz(DATA.A.filter(q=>q.id.startsWith("AZ")).sort((a,b)=>a.id.localeCompare(b.id)),{title:"FE 科目A 幅広60問",mode:"mockA",minutes:90,exam:true});
  $("#mockAPlus").onclick=()=>startQuiz(DATA.A.filter(q=>q.id.startsWith("AX")).sort((a,b)=>a.id.localeCompare(b.id)),{title:"科目A 追加60問セット",mode:"mockA",minutes:90,exam:true});
  $("#past").onclick=()=>startQuiz(DATA.P,{title:"2026年度 IPA公開問題",mode:"past",minutes:0,exam:false});
}
function feBPool(){
  return [...new Map([
    ...DATA.B,...CRASH.btrace,...(CRASH.security||[]),...(CRASH.longB||[]),...(CRASH.longBSec||[]),
    ...(CRASH.examBAlgo||[]),...(CRASH.examBSec||[]),...(CRASH.gapBAlgo||[]),...(CRASH.gapBSec||[])
  ].map(q=>[q.id,q])).values()];
}
function corePracticePool(){
  return [...DATA.A,...DATA.B,...(CRASH.gapBAlgo||[]),...(CRASH.gapBSec||[]),...AWS];
}
function reviewPool(filter){
  let pool=ALL.filter(q=>{
    const s=statsFor(q);
    const needs=s.wrong>0 || s.uncertain;
    if(!needs) return false;
    if(filter==="B") return DATA.B.some(x=>x.id===q.id) || (CRASH.gapBAlgo||[]).some(x=>x.id===q.id) || (CRASH.gapBSec||[]).some(x=>x.id===q.id);
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
  let pool=corePracticePool().filter(q=>weakCats.includes(q.cat));
  const priority=pool.filter(q=>["基礎理論","アルゴリズム・プログラミング","ネットワーク","企業と法務"].includes(q.cat));
  pool=[...priority,...pool];
  startQuiz(shuffle(pool).slice(0,Math.min(n,pool.length)),{title:`弱点優先 ${n}問`,mode:"weak",minutes,exam:false});
}
function startCategory(cat,n){
  const pool=shuffle(corePracticePool().filter(q=>q.cat===cat)).slice(0,n);
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
      ${isMulti(q)?`<div class="multi-note">複数選択：${q.a.length}つ選択</div>`:""}
      <div id="options">${q.opts.map((o,i)=>{const on=isMulti(q)?(Array.isArray(selected)&&selected.includes(i)):selected===i;return `<button class="option ${on?"selected":""}" data-i="${i}"><span class="letter">${String.fromCharCode(65+i)}</span><span>${esc(o)}</span></button>`;}).join("")}</div>
      <div class="flag-row"><span class="muted" style="font-size:12px">自信がなければ復習対象に</span><button class="flag-btn ${flagged?"on":""}" id="flagBtn">？ 迷った</button></div>
      ${(!cur.exam && hasAnswer(selected)) ? `<div class="explain"><b>選択中：${answerLabel(selected)}</b><div class="muted" style="font-size:12px">採点時に正解と解説を表示します。</div></div>`:""}
      ${q.src?`<div class="past-source">${esc(q.src)}</div>`:""}
    </section>
    <div class="quiz-footer">
      <button class="btn ghost" id="prev" ${cur.index===0?"disabled":""}>← 前へ</button>
      ${cur.index===qs.length-1?`<button class="btn primary" id="finish">採点する</button>`:`<button class="btn primary" id="next">次へ →</button>`}
    </div>
    <div class="actions one"><button class="btn ghost full" id="quit">中断して保存</button></div>`;
  $(".option").forEach(b=>b.onclick=()=>{
    const i=Number(b.dataset.i);
    if(isMulti(q)){
      let arr=Array.isArray(cur.answers[q.id])?[...cur.answers[q.id]]:[];
      if(arr.includes(i)) arr=arr.filter(x=>x!==i);
      else {
        if(arr.length>=q.a.length){toast(q.a.length+"つ選択してください");return;}
        arr.push(i);
      }
      if(arr.length) cur.answers[q.id]=arr; else delete cur.answers[q.id];
    } else {
      cur.answers[q.id]=i;
    }
    saveState();renderCurrentQuiz();
  });
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
    const ok=answerCorrect(q,ans);
    if(hasAnswer(ans))answered++;
    if(ok)correct++;
    const st=statsFor(q);
    const wasNew=!st.attempts;
    if(hasAnswer(ans)){st.attempts++;if(ok)st.correct++;else st.wrong++;st.lastAnswer=ans;}
    st.uncertain=flag||(st.uncertain&&!ok);state.stats[q.id]=st;rows.push({q,ans,ok,flag,wasNew});
  });
  const title=cur.title,mode=cur.mode;
  state.history ||= [];
  const endedAt=Date.now();
  const durationSec=cur.startedAt?Math.max(0,Math.round((endedAt-cur.startedAt)/1000)):0;
  state.history.push({mode,title,correct,total:qs.length,answered,flagged,durationSec,at:endedAt});
  state.history=state.history.slice(-80);
  state.current=null;saveState();renderResults(title,rows,correct,answered,flagged,mode);
}
function coachFor(q){
  if(EXPLAIN[q.id]) return EXPLAIN[q.id];
  if(q.focus || q.steps || q.memory || q.trap){
    return {
      focus:q.focus || "正解を決める要件・条件を問題文から特定する。",
      steps:q.steps || [q.exp || "解説を確認する。"],
      memory:q.memory || "要件とサービス/処理を1対1で結び付けて覚える。",
      trap:q.trap || "似た選択肢の役割の違いを確認する。"
    };
  }
  const text=((q.q||"")+" "+(q.code||"")+" "+(q.cat||"")).toLowerCase();

  if(text.includes("cidr") || text.match(/\/2[4-9]|\/3[0-2]/)){
    return {
      focus:"CIDRの /数字 からホスト部のビット数を出し、1ブロックの大きさを求めます。ネットワークアドレスとブロードキャストアドレスはホストに使えません。",
      steps:["/26ならホスト部は32-26=6ビット。","2^6=64個で1ブロック。","64刻みなので…0,64,128,192がネットワーク境界。","そのブロックの先頭がネットワーク、末尾がブロードキャスト。残りがホスト。"],
      memory:"CIDRは『32から引く→2の何乗→その数で刻む』。/26なら 32-26=6 → 2^6=64 → 64刻み。",
      trap:"範囲内でも先頭と末尾は端末に割り当てません。"
    };
  }
  if(text.includes("キャッシュ") && text.includes("ヒット")){
    return {
      focus:"『ミス時にキャッシュ確認後、主記憶へ行く』という条件を見ます。キャッシュ時間はヒットでもミスでも最初に必ず発生します。",
      steps:["まずキャッシュアクセス時間を1回分置く。","ミス率=1-ヒット率を求める。","追加で必要になる主記憶時間×ミス率を足す。"],
      memory:"この型は『まずキャッシュ代を全員払う＋外れた人だけ主記憶代』。",
      trap:"ヒット率×キャッシュ時間＋ミス率×主記憶時間だけにすると、ミス時の最初のキャッシュ確認時間を落とします。"
    };
  }
  if(text.includes("raid")){
    return {
      focus:"RAID番号ではなく『何をどう冗長化しているか』を見ます。",
      steps:["RAID0=分散だけ、冗長性なし。","RAID1=同じ内容を鏡のように複製。","RAID5=データ＋パリティを複数台へ分散。"],
      memory:"0=速いだけ、1=鏡、5=分散パリティ。",
      trap:"RAID5をミラーリングと混同しない。"
    };
  }
  if(text.includes("lru")){
    return {
      focus:"ページの『最後に使われた時刻』だけを比較します。",
      steps:["各ページが最後に参照された位置を確認する。","一番昔から使われていないページを選ぶ。"],
      memory:"LRU = Least Recently Used = 最近いちばん使ってないものを捨てる。",
      trap:"FIFOは『最初に入った』。LRUは『最後に使ったのが最も昔』。"
    };
  }
  if(text.includes("having") || (text.includes("group by") && text.includes("where"))){
    return {
      focus:"条件をかけたい対象が『元の行』か『集計後のグループ』かを見ます。",
      steps:["WHEREはGROUP BYより前に行を絞る。","AVGやCOUNTなどで集計した結果に条件を付けるならHAVING。"],
      memory:"WHERE=集計前、HAVING=集計後。",
      trap:"AVG(給与)のような集計値にWHEREを使わない。"
    };
  }
  if(text.includes("acid") || text.includes("atomicity")){
    return {
      focus:"各英単語の意味と、問題文の症状を対応させます。",
      steps:["Atomicity=全部やるか全部戻す。","Consistency=ルールを壊さない。","Isolation=同時実行を互いに見えにくくする。","Durability=commit後は障害があっても残る。"],
      memory:"Aは All or Nothing、Dは Doneなら残る、と覚えると早い。",
      trap:"『障害後も残る』はAtomicityではなくDurability。"
    };
  }
  if(text.includes("デジタル署名") || text.includes("電子署名")){
    return {
      focus:"署名が守るのは『誰が作ったか』と『途中で変わっていないか』です。",
      steps:["送信者側は秘密鍵で署名。","受信者側は公開鍵で検証。","検証できれば真正性、ハッシュ一致で完全性を確認できる。"],
      memory:"署名=本人確認＋改ざん確認。秘密にするのは暗号化。",
      trap:"署名だけでは内容は秘密になりません。機密性は別問題です。"
    };
  }
  if(text.includes("損益分岐点")){
    return {
      focus:"1個売るごとに固定費回収へ回せる金額『限界利益=売価-変動費』を先に出します。",
      steps:["売価-変動費=1個当たり限界利益。","固定費÷限界利益=損益分岐点数量。"],
      memory:"『固定費を、1個で稼げる粗い利益で割る』。",
      trap:"固定費÷売価ではありません。変動費を必ず引きます。"
    };
  }
  if(text.includes("evm") || (text.includes("pv")&&text.includes("ev")&&text.includes("ac"))){
    return {
      focus:"EVを中心に式を作ります。",
      steps:["CV=EV-AC。マイナスなら予算超過。","SV=EV-PV。マイナスなら進捗遅れ。"],
      memory:"CVはCostだからAC、SVはScheduleだからPV。どちらもEVから引く。",
      trap:"AC-EV、PV-EVと逆向きにしない。"
    };
  }
  if(text.includes("dns") || text.includes("dhcp") || text.includes("arp") || text.includes("napt")){
    return {
      focus:"ネットワーク用語は『何を何に変える/配るのか』だけ見ます。",
      steps:["DNS=名前→IP。","DHCP=端末へIP設定を配る。","ARP=同一LANでIP→MAC。","NAPT=複数の内部IPをポート番号込みで外部IPへ変換。"],
      memory:"DNS=電話帳、DHCP=住所配り、ARP=近所の表札探し、NAPT=マンションの部屋番号付き住所変換。",
      trap:"どれも『アドレスっぽい話』なので役割を混ぜない。"
    };
  }
  if(text.includes("スタック") || text.includes("push") || text.includes("pop")){
    return {
      focus:"スタックの中身を、操作ごとに縦積みとして書きます。",
      steps:["push=一番上に置く。","pop=一番上から取る。","演算子がある問題は、取り出した順と左右オペランドに注意する。"],
      memory:"スタック=皿の山。最後に置いた皿から取る=LIFO。",
      trap:"キューのFIFOと逆。減算・除算では左右も逆にしない。"
    };
  }
  if(text.includes("キュー") || text.includes("enqueue") || text.includes("dequeue") || text.includes("幅優先")){
    return {
      focus:"キューの先頭と末尾だけを追います。",
      steps:["enqueue=末尾へ追加。","dequeue=先頭から取り出す。","BFSでは発見した順にキューへ入るので、近い頂点から処理される。"],
      memory:"キュー=レジ待ち。先に並んだ人から出る=FIFO。BFSも同じ。",
      trap:"DFSのように1本を奥まで追わない。"
    };
  }
  if(text.includes("深さ優先") || text.includes("dfs(")){
    return {
      focus:"現在位置から未訪問の隣接頂点へ、行けるだけ奥まで進みます。",
      steps:["最小番号など問題文指定の順で次の頂点へ進む。","行き止まりになったら1つ前へ戻る。","未訪問があればまた奥へ進む。"],
      memory:"DFS=迷路で片方の道を行けるところまで行って、ダメなら戻る。再帰/スタック。",
      trap:"BFSのように同じ距離の頂点を先に全部処理しない。"
    };
  }
  if(text.includes("選択ソート")){
    return {
      focus:"外側ループ1回につき『残り範囲の最小値を1個だけ確定』させます。",
      steps:["i位置より右から最小値を探す。","その最小値とa[i]を交換する。","iが1増えるたび左側が確定する。"],
      memory:"選択ソート=『一番小さい人を選んで前へ』を繰り返す。",
      trap:"1回の外側ループで配列全体が整列するとは限りません。"
    };
  }
  if(text.includes("挿入ソート")){
    return {
      focus:"iより左側は既に整列済み、と考えます。keyを左側の正しい位置へ差し込みます。",
      steps:["key=a[i]を一旦退避。","keyより大きい値を右へ1つずつずらす。","空いた位置へkeyを入れる。"],
      memory:"挿入ソート=トランプを手札の正しい位置へ差し込む。",
      trap:"交換を繰り返すのではなく、大きい要素を右へずらして最後にkeyを入れる型もあります。"
    };
  }
  if(text.includes("クイックソート") || text.includes("pivot")){
    return {
      focus:"基準値pivotより小さい/大きいを分ける処理だけ見ます。",
      steps:["pivotを確認。","条件を満たす要素を左側領域へ集める。","最後にpivotを境界位置へ置く。"],
      memory:"クイックソート=基準線を1本引いて、小さい組と大きい組に分ける。",
      trap:"分割1回で完全整列するとは限りません。"
    };
  }
  if(text.includes("フィボ") || text.includes("fib(")){
    return {
      focus:"再帰木を全部書かず、f(0),f(1)から順に小さい値を表にします。",
      steps:["f(0)=0,f(1)=1。","f(2)=1、f(3)=2、f(4)=3…と足していく。","求めるnまで表を伸ばす。"],
      memory:"フィボナッチは 0,1,1,2,3,5,8,13 をまず言えるようにする。",
      trap:"呼出し回数と関数の戻り値は別です。"
    };
  }
  if(text.includes("再帰")){
    return {
      focus:"終了条件と、nが次にどう小さくなるかを先に確認します。",
      steps:["ベースケースの戻り値を書く。","n→n-1やn-2など、次の呼出しだけ展開する。","一番小さい呼出しまで到達したら下から戻り値を計算する。"],
      memory:"再帰=『小さい自分に仕事を渡して、答えが返ってきたら計算』。",
      trap:"上から暗算だけで追うと途中で崩れやすいので、呼出しと戻りを分ける。"
    };
  }
  if(text.includes("連結リスト") || text.includes("next[")){
    return {
      focus:"値ではなく『矢印nextがどこを指すか』を図にします。",
      steps:["現在のつながりを 1→3→2 のように書く。","挿入なら 新ノード→次 を先に設定してから 前ノード→新ノード。","削除なら前ノードから削除対象の次へ1個飛ばしてつなぐ。"],
      memory:"リスト問題は数字の計算ではなく矢印問題。nextを矢印として描く。",
      trap:"data配列の並び順と、nextでたどる論理順序は同じとは限りません。"
    };
  }
  if(text.includes("ランレングス")){
    return {
      focus:"同じ文字が『全体で何個』ではなく『連続して何個』かを塊ごとに見ます。",
      steps:["文字が変わるところに区切り線を入れる。","各塊の文字と個数を数える。","最後の塊をループ後に出力するコードか確認する。"],
      memory:"ランレングス=AAAAをA4にする圧縮。",
      trap:"離れた場所に同じ文字があっても別の塊です。"
    };
  }

  return {
    focus:"問題文の中で、正解を決める条件・式・更新行を1つ特定します。",
    steps:[q.exp||"解説を確認する。","選択肢を正解条件と1つずつ照合する。"],
    memory:"この問題は答えそのものより『正解を決めた1行』を覚える。",
    trap:"似た用語や途中値を選ばないよう、最終的に何を聞かれているかを確認する。"
  };
}
function scratchRule(q){
  const t=((q.q||"")+" "+(q.code||"")+" "+(q.focus||"")).toLowerCase();
  if(q.scratch) return q.scratch;
  if(q.exam==="AWS"){
    return "紙には『必須要件→禁止条件→優先軸』の3つだけ書く。例：高可用 / 運用最小 / コスト優先。サービス名を先に思い出そうとしない。";
  }
  if(t.includes("low")&&t.includes("high")&&t.includes("mid")) return "L・H・M・a[M] の4列だけ書く。各周回で更新後のL/Hを1行追加する。";
  if(t.includes("stack")||t.includes("スタック")||t.includes("push")||t.includes("pop")) return "スタックを縦に描き、pushで上へ追加、popで上を消す。頭の中だけで追わない。";
  if(t.includes("queue")||t.includes("キュー")||t.includes("enqueue")||t.includes("dequeue")) return "キューを『出口 ← 要素列 ← 入口』で書き、dequeueで左、enqueueで右を更新する。";
  if(t.includes("matrix")||t.includes("行列")||t.includes("m[")||t.includes("r[")) return "元の添字(i,j)→移動先の添字を1要素ずつ書く。まず(1,1),(1,2),(1,3)だけで規則を確認する。";
  if(t.includes("再帰")||t.includes("fib(")||t.includes("power(")) return "終了条件を最上段に書き、呼出しは↓、戻り値は↑で別々に追う。";
  if(t.includes("dp[")||t.includes("動的計画")) return "dpの意味を日本語で1行書く→初期値→更新式の順。必要な添字だけ横表にする。";
  if(t.includes("left")&&t.includes("right")) return "left / right / 判定値 の3列。どちらを動かすと値が増減するかを矢印で書く。";
  if(q.code) return "答えに関係する変数だけ抜き出し、『初期値→更新後』を表にする。コード全文を書き写さない。";
  return "問題文の条件を1〜3語で横にメモし、選択肢をその条件に合う/合わないで消す。";
}
const TERM_ROLE = [
["CloudFront","CDN/エッジキャッシュ"],["Global Accelerator","TCP/UDPのグローバル経路最適化"],["Route 53","DNS/ヘルスチェック/ルーティング"],
["SQS","メッセージキュー/疎結合"],["SNS","Pub/Sub・ファンアウト"],["EventBridge","イベントルーティング"],["Step Functions","ワークフロー制御"],
["Multi-AZ","高可用性・自動フェイルオーバー"],["Read Replica","読み取りスケール"],["RDS Proxy","DB接続プール"],["DAX","DynamoDB専用キャッシュ"],
["EBS","EC2向けブロックストレージ"],["EFS","共有NFSファイル"],["FSx","用途特化ファイルシステム"],["S3","オブジェクトストレージ"],
["WAF","HTTP(S)のWeb攻撃対策"],["Shield","DDoS対策"],["GuardDuty","脅威検知"],["Inspector","脆弱性管理"],["Macie","S3の機密データ検出"],
["Secrets Manager","シークレット保管/ローテーション"],["KMS","暗号鍵管理"],["CloudTrail","API操作監査"],["Config","設定変更/準拠評価"],
["Auto Scaling","台数自動調整"],["ALB","L7 HTTP負荷分散"],["NLB","L4 TCP/UDP高性能負荷分散"],["Lambda","イベント駆動サーバレス実行"],
["DataSync","オンラインデータ転送/同期"],["DMS","DB移行/レプリケーション"],["Direct Connect","専用線"],["PrivateLink","VPCからサービスへ私設接続"]
];
function optionReason(q,i){
  if(Array.isArray(q.why) && q.why[i]) return q.why[i];
  const correct=isMulti(q)?q.a.includes(i):q.a===i;
  if(correct) return "○ "+(q.exp||"問題条件を満たす選択肢。");
  const o=String(q.opts?.[i]||"");
  for(const [term,role] of TERM_ROLE){
    if(o.includes(term)) return "× "+term+"は「"+role+"」。この設問の決め手（"+(q.focus||"条件")+"）とは役割がずれる。";
  }
  if(/[0-9]/.test(o) && (q.code||/[計算率秒時間個]/.test(q.q||""))) return "× 計算・トレース結果が一致しない。上の手順を1行ずつ追うと除外できる。";
  return "× 「"+(q.focus||"正解条件")+"」を満たさない。用語の役割ではなく、設問の必須条件と照合して切る。";
}
function clueLine(q){
  if(q.clue) return q.clue;
  const ans=answerLabel(q.a);
  return (q.focus||"正解を決める条件を特定する。")+" → 正解 "+ans;
}
function traceTableHtml(trace){
  if(!trace || !trace.headers || !trace.rows) return "";
  return `<div class="trace-wrap"><div class="trace-title">実際にこう追う</div><table class="trace-table"><thead><tr>${trace.headers.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${trace.rows.map(row=>`<tr>${row.map(v=>`<td>${esc(String(v))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderResults(title,rows,correct,answered,flagged,mode){
  const total=rows.length,acc=pct(correct,total),cats={};
  const firstRows=rows.filter(r=>r.wasNew), firstCorrect=firstRows.filter(r=>r.ok).length, firstAcc=pct(firstCorrect,firstRows.length);
  rows.forEach(r=>{cats[r.q.cat] ||= {n:0,c:0};cats[r.q.cat].n++;if(r.ok)cats[r.q.cat].c++;});
  main.innerHTML=`
    <h2>${esc(title)} 結果</h2>
    <section class="card">
      <div class="result-score ${acc>=80?"good":acc>=60?"mid":"bad"}">${correct}/${total}</div>
      <p><b>${acc}%</b>　回答済み ${answered}/${total}　？ ${flagged}問</p>
      <div class="result-grid"><div class="result-box"><b>${rows.filter(r=>!r.ok).length}</b><div class="muted">誤答/未回答</div></div><div class="result-box"><b>${flagged}</b><div class="muted">迷った問題</div></div></div>
      <div class="result-grid" style="margin-top:8px"><div class="result-box"><b>${firstRows.length}</b><div class="muted">今回の初見</div></div><div class="result-box"><b>${firstRows.length?firstAcc+"%":"—"}</b><div class="muted">初見正答率</div></div></div>
    </section>
    <section class="card"><h3>分野別</h3>${Object.entries(cats).map(([cat,x])=>`<div class="category-row"><div style="display:flex;justify-content:space-between"><b>${esc(cat)}</b><b>${x.c}/${x.n}</b></div><div class="bar"><span style="width:${pct(x.c,x.n)}%"></span></div></div>`).join("")}</section>
    <section>${rows.map((r,i)=>`<details ${(!r.ok||r.flag)?"open":""}><summary>${i+1}. ${r.ok?"✅":"❌"} ${esc(r.q.q).slice(0,48)}${r.q.q.length>48?"…":""}${r.flag?"　？":""}</summary><div class="inside">${r.q.code?`<div class="code">${esc(r.q.code)}</div>`:""}<p>あなた：<b>${answerLabel(r.ans)}</b>　正解：<b>${answerLabel(r.q.a)}</b></p><div class="clue-box"><b>30秒で見抜く</b><div>${esc(clueLine(r.q))}</div></div><div class="focus-box"><b>この問題ではここを見る</b><div>${esc(coachFor(r.q).focus)}</div></div><div class="solve-guide"><b>実際の解き方</b><ol>${coachFor(r.q).steps.map(s=>`<li>${esc(s)}</li>`).join("")}</ol></div><div class="scratch-box"><b>紙に書くなら</b><div>${esc(scratchRule(r.q))}</div></div>${traceTableHtml(coachFor(r.q).trace)}<div class="option-why"><b>選択肢をこう切る</b>${r.q.opts.map((o,oi)=>`<div class="option-why-row"><span>${String.fromCharCode(65+oi)}. ${esc(o)}</span><small>${esc(optionReason(r.q,oi))}</small></div>`).join("")}</div><div class="explain"><b>なぜこの答えになるか</b><div>${esc(r.q.exp||"")}</div></div><div class="memory-tip"><b>こう覚えると楽</b><div>${esc(coachFor(r.q).memory)}</div></div><div class="trap-tip"><b>本番のひっかけ</b><div>${esc(coachFor(r.q).trap)}</div></div>${r.q.src?`<div class="past-source">${esc(r.q.src)}</div>`:""}</div></details>`).join("")}</section>
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