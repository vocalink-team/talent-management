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
  if(memberError){throw new Error("運営メンバー情報を取得できませんでした。Supabaseの権限設定を確認してください。");}if(!member?.is_active){throw new Error("このアカウントは運営メンバーとして有効化されていません。");}
  document.getElementById("auth-user").textContent=(profile?.display_name||user.email)+" / "+(roleLabels[member.role]||member.role);

  const [talents,projects,schedules,revenue,contracts]=await Promise.all([
    supabase.from("talents").select("id,name,stage_name,status,contract_end_date,bio").order("created_at",{ascending:false}),
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
  const canManageTalents=["owner","admin","manager","creative"].includes(member.role);
  const canDeleteTalents=["owner","admin"].includes(member.role);
  const talentForm=document.getElementById("talent-form");
  if(!canManageTalents) document.querySelector("#talents .form-panel")?.remove();
  const renderTalents=()=>{ 
    talentTable.innerHTML="<tr><th>名前</th><th>状態</th><th>契約終了</th><th>操作</th></tr>"+t.map(x=>"<tr><td>"+esc(x.stage_name||x.name)+"</td><td>"+esc(x.status)+"</td><td>"+esc(x.contract_end_date||"—")+"</td><td><div class='row-actions'>"+(canManageTalents?"<button data-edit-talent='"+x.id+"'>編集</button>":"")+(canDeleteTalents?"<button class='danger' data-delete-talent='"+x.id+"'>削除</button>":"")+"</div></td></tr>").join("")+(t.length?"":"<tr><td colspan='4'>歌い手はまだ登録されていません。</td></tr>");
  };
  renderTalents();
  document.querySelectorAll("[data-edit-talent]").forEach(btn=>btn.addEventListener("click",()=>{const x=t.find(v=>v.id===btn.dataset.editTalent);if(!x)return;document.getElementById("talent-id").value=x.id;document.getElementById("talent-name").value=x.name||"";document.getElementById("talent-stage").value=x.stage_name||"";document.getElementById("talent-status").value=x.status;document.getElementById("talent-contract-end").value=x.contract_end_date||"";document.getElementById("talent-bio").value=x.bio||"";document.querySelector("#talents details").open=true;}));
  document.querySelectorAll("[data-delete-talent]").forEach(btn=>btn.addEventListener("click",async()=>{if(!confirm("この歌い手を削除しますか？"))return;const {error}=await supabase.from("talents").delete().eq("id",btn.dataset.deleteTalent);if(error)alert(error.message);else load();}));
  talentForm?.addEventListener("submit",async e=>{e.preventDefault();const id=document.getElementById("talent-id").value;const payload={name:document.getElementById("talent-name").value.trim(),stage_name:document.getElementById("talent-stage").value.trim()||null,status:document.getElementById("talent-status").value,contract_end_date:document.getElementById("talent-contract-end").value||null,bio:document.getElementById("talent-bio").value.trim()||null};const q=id?supabase.from("talents").update(payload).eq("id",id):supabase.from("talents").insert({...payload,created_by:user.id});const {error}=await q;if(error)alert(error.message);else load();});
  document.getElementById("talent-cancel")?.addEventListener("click",()=>{talentForm.reset();document.getElementById("talent-id").value="";});
  const projectForm=document.getElementById("project-form");
  const canManageProjects=["owner","admin","manager","creative"].includes(member.role);
  if(!canManageProjects) document.querySelector("#projects .form-panel")?.remove();
  projectForm?.addEventListener("submit",async e=>{e.preventDefault();const payload={title:document.getElementById("project-title").value.trim(),client_name:document.getElementById("project-client").value.trim()||null,status:document.getElementById("project-status").value,budget:Number(document.getElementById("project-budget").value||0),due_date:document.getElementById("project-due").value||null,description:document.getElementById("project-description").value.trim()||null,created_by:user.id};const {error}=await supabase.from("management_projects").insert(payload);if(error)alert(error.message);else load();});
  const projectCards=document.querySelector("#projects .cards");
  projectCards.innerHTML=p.length?p.map(x=>"<div><i>"+esc(x.status)+"</i><h3>"+esc(x.title)+"</h3><p>"+esc(x.due_date||"期限未設定")+"</p><strong>"+fmt(x.budget)+"</strong></div>").join(""):"<div><p>案件はまだありません。</p></div>";
  const scheduleSection=document.querySelector("#schedule");
  const existing=scheduleSection.querySelectorAll("p");existing.forEach(x=>x.remove());
  s.forEach(x=>{const p=document.createElement("p");p.textContent=new Date(x.starts_at).toLocaleString("ja-JP",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})+"　"+x.title;scheduleSection.appendChild(p);});
  if(!s.length){const p=document.createElement("p");p.textContent="今後の予定はありません。";scheduleSection.appendChild(p);}
  document.getElementById("logout").addEventListener("click",async()=>{await supabase.auth.signOut();location.href="login.html";});
  document.getElementById("new-project").addEventListener("click",()=>location.hash="projects");
}


load().catch(err=>{console.error(err);alert(err.message||"読み込みに失敗しました");});
