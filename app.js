import { supabase } from "./supabase-client.js";

const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const fmt=n=>new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY",maximumFractionDigits:0}).format(Number(n||0));
const roleLabels={owner:"オーナー",admin:"管理者",manager:"マネージャー",accounting:"経理",legal:"法務",creative:"クリエイティブ",talent:"歌い手"};

async function load(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){location.href="login.html";return;}
  const user=session.user;
  const {data:profile}=await supabase.from("profiles").select("display_name").eq("id",user.id).maybeSingle();
  const {data:member,error:memberError}=await supabase.from("management_members").select("role,is_active").eq("user_id",user.id).maybeSingle();
  if(memberError||!member?.is_active){await supabase.auth.signOut();location.href="login.html";return;}
  document.getElementById("auth-user").textContent=(profile?.display_name||user.email)+" / "+(roleLabels[member.role]||member.role);

  const [talents,projects,schedules,revenue,contracts]=await Promise.all([
    supabase.from("talents").select("id,name,stage_name,status,contract_end_date").order("created_at",{ascending:false}),
    supabase.from("management_projects").select("id,title,status,budget,due_date").order("created_at",{ascending:false}),
    supabase.from("schedules").select("id,title,starts_at,talent_id").gte("starts_at",new Date().toISOString()).order("starts_at").limit(5),
    supabase.from("revenue_transactions").select("amount,transaction_type").gte("occurred_on",new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10)),
    supabase.from("contracts").select("id,title,ends_on,contract_status").not("ends_on","is",null).order("ends_on").limit(5)
  ]);
  if([talents,projects,schedules,revenue,contracts].some(x=>x.error)) throw new Error("データ取得に失敗しました。権限設定を確認してください。");
  const t=talents.data||[],p=projects.data||[],s=schedules.data||[],r=revenue.data||[],c=contracts.data||[];
  const income=r.filter(x=>x.transaction_type==="income").reduce((a,x)=>a+Number(x.amount||0),0);
  const activeProjects=p.filter(x=>!["completed","cancelled"].includes(x.status)).length;
  const expiring=c.filter(x=>x.ends_on && new Date(x.ends_on+"T23:59:59")<=new Date(Date.now()+30*86400000)).length;
  document.querySelector(".stats>div:nth-child(1) strong").textContent=t.filter(x=>x.status==="active").length;
  document.querySelector(".stats>div:nth-child(2) strong").textContent=activeProjects;
  document.querySelector(".stats>div:nth-child(3) strong").textContent=fmt(income);
  document.querySelector(".stats>div:nth-child(4) strong").textContent=expiring;

  const talentTable=document.querySelector("#talents table");
  talentTable.innerHTML="<tr><th>名前</th><th>状態</th><th>契約終了</th><th>ID</th></tr>"+t.map(x=>"<tr><td>"+esc(x.stage_name||x.name)+"</td><td>"+esc(x.status)+"</td><td>"+esc(x.contract_end_date||"—")+"</td><td><small>"+esc(x.id.slice(0,8))+"</small></td></tr>").join("");
  const projectCards=document.querySelector("#projects .cards");
  projectCards.innerHTML=p.length?p.map(x=>"<div><i>"+esc(x.status)+"</i><h3>"+esc(x.title)+"</h3><p>"+esc(x.due_date||"期限未設定")+"</p><strong>"+fmt(x.budget)+"</strong></div>").join(""):"<div><p>案件はまだありません。</p></div>";
  const scheduleSection=document.querySelector("#schedule");
  const existing=scheduleSection.querySelectorAll("p");existing.forEach(x=>x.remove());
  s.forEach(x=>{const p=document.createElement("p");p.textContent=new Date(x.starts_at).toLocaleString("ja-JP",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})+"　"+x.title;scheduleSection.appendChild(p);});
  if(!s.length){const p=document.createElement("p");p.textContent="今後の予定はありません。";scheduleSection.appendChild(p);}
  document.getElementById("logout").addEventListener("click",async()=>{await supabase.auth.signOut();location.href="login.html";});
  document.getElementById("new-project").addEventListener("click",()=>location.hash="projects");
}

supabase.auth.onAuthStateChange((_event,session)=>{if(!session) location.href="login.html";});
load().catch(err=>{console.error(err);alert(err.message||"読み込みに失敗しました");});
