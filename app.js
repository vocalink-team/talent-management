import { supabase } from "./supabase-client.js";

const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const fmt=n=>new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY",maximumFractionDigits:0}).format(Number(n||0));
const roleLabels={owner:"オーナー",admin:"管理者",manager:"マネージャー",accounting:"経理",legal:"法務",creative:"クリエイティブ",talent:"歌い手"};
const statusLabels={active:"活動中",paused:"休止",graduated:"卒業",inactive:"停止",inquiry:"問い合わせ",planning:"企画",in_progress:"進行中",review:"確認待ち",completed:"完了",cancelled:"キャンセル",draft:"下書き",submitted:"提出済み",approved:"承認済み",rejected:"差し戻し"};

async function load(){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){location.href="login.html";return;}
  const user=session.user;
  const {data:profile}=await supabase.from("profiles").select("display_name").eq("id",user.id).maybeSingle();
  const {data:member,error:memberError}=await supabase.from("management_members").select("role,is_active").eq("user_id",user.id).maybeSingle();
  if(memberError) throw new Error("権限情報を取得できませんでした。");
  if(!member?.is_active) throw new Error("このアカウントは有効化されていません。");
  const role=member.role;
  const isTalent=role==="talent";
  const isManagement=!isTalent;

  document.getElementById("auth-user").textContent=(profile?.display_name||user.email)+" / "+(roleLabels[role]||role);
  document.querySelector("header h1").textContent=isTalent?"タレントマイページ":"運営ダッシュボード";
  document.querySelector("header p").textContent=isTalent?"案件・予定・契約・報告を運営と共有":"所属タレントの活動・案件・契約・収益を一元管理";
  document.getElementById("new-project").hidden=isTalent;

  let ownTalent=null;
  if(isTalent){
    const {data,error}=await supabase.from("talents").select("id,name,stage_name,status,contract_end_date,bio,user_id").eq("user_id",user.id).maybeSingle();
    if(error) throw new Error("タレント情報を取得できませんでした。");
    ownTalent=data;
    if(!ownTalent) throw new Error("このアカウントにタレント情報が紐付いていません。運営にアカウント連携を依頼してください。");
  }

  const [talents,projects,schedules,revenue,distributions,contracts,reports]=await Promise.all([
    supabase.from("talents").select("id,name,stage_name,status,contract_end_date,bio,user_id").order("created_at",{ascending:false}),
    supabase.from("management_projects").select("id,title,status,budget,due_date").order("created_at",{ascending:false}),
    supabase.from("schedules").select("id,title,starts_at,talent_id").gte("starts_at",new Date().toISOString()).order("starts_at").limit(10),
    supabase.from("revenue_transactions").select("amount,transaction_type,talent_id").gte("occurred_on",new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10)),
    supabase.from("revenue_distributions").select("amount,status,talent_id").in("status",["calculated","approved","paid"]),
    supabase.from("contracts").select("id,title,ends_on,contract_status,talent_id").not("ends_on","is",null).order("ends_on").limit(10),
    supabase.from("activity_reports").select("id,talent_id,title,report_date,status,body,submitted_by").order("report_date",{ascending:false}).limit(20)
  ]);
  if([talents,projects,schedules,revenue,distributions,contracts,reports].some(x=>x.error)) throw new Error("共有データの取得に失敗しました。権限設定を確認してください。");

  const allTalents=talents.data||[];
  const t=isTalent?allTalents.filter(x=>x.id===ownTalent.id):allTalents;
  const p=projects.data||[];
  const s=schedules.data||[];
  const r=revenue.data||[];
  const d=distributions.data||[];
  const c=contracts.data||[];
  const rep=reports.data||[];

  let visibleProjects=p;
  if(isTalent){
    const {data:links,error}=await supabase.from("project_talents").select("project_id").eq("talent_id",ownTalent.id);
    if(error) throw new Error("担当案件を取得できませんでした。");
    const ids=new Set((links||[]).map(x=>x.project_id));
    visibleProjects=p.filter(x=>ids.has(x.id));
  }
  const visibleSchedules=isTalent?s.filter(x=>x.talent_id===ownTalent.id):s;
  const visibleContracts=isTalent?c.filter(x=>x.talent_id===ownTalent.id):c;
  const visibleReports=isTalent?rep.filter(x=>x.talent_id===ownTalent.id):rep;
  const visibleDistributions=isTalent?d.filter(x=>x.talent_id===ownTalent.id):d;
  const income=isTalent
    ? visibleDistributions.reduce((a,x)=>a+Number(x.amount||0),0)
    : r.filter(x=>x.transaction_type==="income").reduce((a,x)=>a+Number(x.amount||0),0);
  const distribution=isTalent?income:d.reduce((a,x)=>a+Number(x.amount||0),0);
  const operation=isTalent?0:income-distribution;
  const activeProjects=visibleProjects.filter(x=>!["completed","cancelled"].includes(x.status)).length;
  const expiring=visibleContracts.filter(x=>x.ends_on && new Date(x.ends_on+"T23:59:59")<=new Date(Date.now()+30*86400000)).length;

  document.querySelector(".stats>div:nth-child(1) strong").textContent=isTalent?t.length:t.filter(x=>x.status==="active").length;
  document.querySelector(".stats>div:nth-child(1) span").textContent=isTalent?"自分のプロフィール":"所属タレント";
  document.querySelector(".stats>div:nth-child(2) strong").textContent=activeProjects;
  document.querySelector(".stats>div:nth-child(2) span").textContent=isTalent?"参加中案件":"進行中案件";
  document.querySelector(".stats>div:nth-child(3) strong").textContent=fmt(income);
  document.querySelector(".stats>div:nth-child(3) span").textContent=isTalent?"分配予定・確定":"今月売上";
  document.querySelector(".stats>div:nth-child(4) strong").textContent=expiring;
  document.querySelector(".stats>div:nth-child(4) span").textContent="契約更新";
  document.getElementById("finance-income").textContent=fmt(income);
  document.getElementById("finance-distribution").textContent=fmt(distribution);
  document.getElementById("finance-operation").textContent=fmt(operation);

  const talentArea=document.querySelector("#dashboard article:first-child");
  talentArea.querySelectorAll(".talent").forEach(x=>x.remove());
  t.slice(0,5).forEach(x=>{const el=document.createElement("div");el.className="talent";el.innerHTML="<b>"+esc((x.stage_name||x.name||"?").slice(0,1))+"</b><span><strong>"+esc(x.stage_name||x.name)+"</strong>"+esc(x.bio||"")+"</span><i>"+esc(statusLabels[x.status]||x.status)+"</i>";talentArea.appendChild(el);});
  if(!t.length){const el=document.createElement("div");el.className="talent";el.innerHTML="<b>—</b><span><strong>データなし</strong></span><i>—</i>";talentArea.appendChild(el);}
  
  const talentTable=document.querySelector("#talents table");
  const canManageTalents=["owner","admin","manager","creative"].includes(role);
  const canDeleteTalents=["owner","admin"].includes(role);
  const talentForm=document.getElementById("talent-form");
  if(!canManageTalents) document.querySelector("#talents .form-panel")?.remove();
  let profiles=[];
  if(["owner","admin"].includes(role)){
    const q=await supabase.from("profiles").select("id,display_name").order("display_name");
    if(!q.error) profiles=q.data||[];
    const userSelect=document.getElementById("talent-user");
    if(userSelect) userSelect.innerHTML="<option value=''>アカウント未連携</option>"+profiles.map(x=>"<option value='"+esc(x.id)+"'>"+esc(x.display_name||x.id)+"</option>").join("");
  }
  const renderTalents=()=>{
    const rows=t.map(x=>"<tr><td>"+esc(x.stage_name||x.name)+"</td><td>"+esc(statusLabels[x.status]||x.status)+"</td><td>"+esc(x.contract_end_date||"—")+"</td><td><div class='row-actions'>"+(canManageTalents?"<button data-edit-talent='"+x.id+"'>編集</button>":"")+(canDeleteTalents?"<button class='danger' data-delete-talent='"+x.id+"'>削除</button>":"")+"</div></td></tr>").join("");
    talentTable.innerHTML="<tr><th>名前</th><th>状態</th><th>契約終了</th><th>操作</th></tr>"+(rows||"<tr><td colspan='4'>データはありません。</td></tr>");
  };
  renderTalents();
  document.querySelectorAll("[data-edit-talent]").forEach(btn=>btn.addEventListener("click",()=>{const x=t.find(v=>v.id===btn.dataset.editTalent);if(!x)return;document.getElementById("talent-id").value=x.id;document.getElementById("talent-name").value=x.name||"";document.getElementById("talent-stage").value=x.stage_name||"";document.getElementById("talent-status").value=x.status;document.getElementById("talent-contract-end").value=x.contract_end_date||"";document.getElementById("talent-bio").value=x.bio||"";const u=document.getElementById("talent-user");if(u)u.value=x.user_id||"";document.querySelector("#talents details").open=true;}));
  document.querySelectorAll("[data-delete-talent]").forEach(btn=>btn.addEventListener("click",async()=>{if(!confirm("このタレントを削除しますか？"))return;const {error}=await supabase.from("talents").delete().eq("id",btn.dataset.deleteTalent);if(error)alert(error.message);else load();}));
  talentForm?.addEventListener("submit",async e=>{e.preventDefault();const id=document.getElementById("talent-id").value;const payload={name:document.getElementById("talent-name").value.trim(),stage_name:document.getElementById("talent-stage").value.trim()||null,status:document.getElementById("talent-status").value,contract_end_date:document.getElementById("talent-contract-end").value||null,bio:document.getElementById("talent-bio").value.trim()||null};const u=document.getElementById("talent-user");if(u)payload.user_id=u.value||null;const q=id?supabase.from("talents").update(payload).eq("id",id):supabase.from("talents").insert({...payload,created_by:user.id});const {error}=await q;if(error)alert(error.message);else load();});
  document.getElementById("talent-cancel")?.addEventListener("click",()=>{talentForm.reset();document.getElementById("talent-id").value="";});

  const projectForm=document.getElementById("project-form");
  const canManageProjects=["owner","admin","manager","creative"].includes(role);
  if(!canManageProjects) document.querySelector("#projects .form-panel")?.remove();
  const projectTalentSelect=document.getElementById("project-talents");
  if(projectTalentSelect) projectTalentSelect.innerHTML=allTalents.map(x=>"<option value='"+x.id+"'>"+esc(x.stage_name||x.name)+"</option>").join("");
  projectForm?.addEventListener("submit",async e=>{e.preventDefault();const payload={title:document.getElementById("project-title").value.trim(),client_name:document.getElementById("project-client").value.trim()||null,status:document.getElementById("project-status").value,budget:Number(document.getElementById("project-budget").value||0),due_date:document.getElementById("project-due").value||null,description:document.getElementById("project-description").value.trim()||null,created_by:user.id};const {data:project,error}=await supabase.from("management_projects").insert(payload).select("id").single();if(error){alert(error.message);return;}const ids=[...(projectTalentSelect?.selectedOptions||[])].map(x=>x.value);if(ids.length){const {error:linkError}=await supabase.from("project_talents").insert(ids.map(talent_id=>({project_id:project.id,talent_id})));if(linkError){alert(linkError.message);return;}}load();});
  const projectCards=document.querySelector("#projects .cards");
  projectCards.innerHTML=visibleProjects.length?visibleProjects.map(x=>"<div><i>"+esc(statusLabels[x.status]||x.status)+"</i><h3>"+esc(x.title)+"</h3><p>"+esc(x.due_date||"期限未設定")+"</p><strong>"+fmt(x.budget)+"</strong></div>").join(""):"<div><p>共有されている案件はありません。</p></div>";

  const contractNotice=document.querySelector("#contracts .notice");
  contractNotice.innerHTML=visibleContracts.length?"<strong>"+(isTalent?"あなたの契約":"更新期限が近い契約")+"</strong>"+visibleContracts.map(x=>"<span>"+esc(x.title)+" — "+esc(x.ends_on||"期限未設定")+"</span>").join(""):"<strong>契約情報</strong><span>共有されている契約はありません。</span>";

  const scheduleSection=document.querySelector("#schedule");
  scheduleSection.querySelectorAll("p").forEach(x=>x.remove());
  visibleSchedules.forEach(x=>{const el=document.createElement("p");el.textContent=new Date(x.starts_at).toLocaleString("ja-JP",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})+"　"+x.title;scheduleSection.appendChild(el);});
  if(!visibleSchedules.length){const el=document.createElement("p");el.textContent="共有されている予定はありません。";scheduleSection.appendChild(el);}

  const reportSection=document.getElementById("reports");
  if(reportSection){
    const reportForm=reportSection.querySelector("#report-form");
    if(!isTalent) reportForm?.remove();
    if(isTalent && ownTalent){
      reportForm.querySelector("#report-title").value="";
    }
    const list=reportSection.querySelector(".report-list");
    list.innerHTML=visibleReports.length?visibleReports.map(x=>"<article><strong>"+esc(x.title)+"</strong><span>"+esc(x.report_date)+" / "+esc(statusLabels[x.status]||x.status)+"</span><p>"+esc(x.body)+"</p></article>").join(""):"<p>活動報告はありません。</p>";
    reportForm?.addEventListener("submit",async e=>{e.preventDefault();const payload={talent_id:ownTalent.id,report_date:document.getElementById("report-date").value||new Date().toISOString().slice(0,10),title:document.getElementById("report-title").value.trim(),body:document.getElementById("report-body").value.trim(),status:"submitted",submitted_by:user.id};const {error}=await supabase.from("activity_reports").insert(payload);if(error)alert(error.message);else load();});
  }

  if(isTalent){
    document.querySelector("#finance").querySelector("h2").textContent="自分の収益";
    document.querySelector("#finance .finance div:nth-child(1)").firstChild.textContent="分配予定・確定";
    document.querySelector("#finance .finance div:nth-child(2)").firstChild.textContent="分配件数";
    document.getElementById("finance-distribution").textContent=String(visibleDistributions.length)+"件";
    document.getElementById("finance-operation").textContent="運営と共有";
  }
  document.getElementById("logout").onclick=async()=>{await supabase.auth.signOut();location.href="login.html";};
}
load().catch(err=>{console.error(err);alert(err.message||"読み込みに失敗しました");});