import { supabase } from "./supabase-client.js";

const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const fmt=n=>new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY",maximumFractionDigits:0}).format(Number(n||0));
const roleLabels={owner:"オーナー",admin:"管理者",manager:"マネージャー",accounting:"経理",legal:"法務",creative:"クリエイティブ",talent:"歌い手"};
const statusLabels={active:"活動中",paused:"休止",graduated:"卒業",inactive:"停止",inquiry:"問い合わせ",planning:"企画",in_progress:"進行中",review:"確認待ち",completed:"完了",cancelled:"キャンセル",draft:"下書き",submitted:"提出済み",approved:"承認済み",rejected:"差し戻し"};

async function handleLogout(event){
  event?.preventDefault();
  event?.stopPropagation();
  const button=document.getElementById("logout");
  if(button){button.disabled=true;button.textContent="ログアウト中…";}

  // Supabase JS の local signOut はネットワーク状態等で失敗する場合がある。
  // まず通常の signOut を試し、必ずこのプロジェクトのローカル認証データを破棄して終了する。
  try{
    await Promise.race([
      supabase.auth.signOut({scope:"local"}),
      new Promise(resolve=>setTimeout(resolve,1500))
    ]);
  }catch(err){
    console.warn("signOut request failed",err);
  }

  try{
    const projectRef="olvetzzzkwryluedlhpv";
    for(let i=localStorage.length-1;i>=0;i--){
      const key=localStorage.key(i);
      if(key && (key.startsWith("sb-"+projectRef+"-auth-token") || (key.includes(projectRef) && key.includes("auth")))){
        localStorage.removeItem(key);
      }
    }
    for(let i=sessionStorage.length-1;i>=0;i--){
      const key=sessionStorage.key(i);
      if(key && (key.startsWith("sb-"+projectRef+"-auth-token") || (key.includes(projectRef) && key.includes("auth")))){
        sessionStorage.removeItem(key);
      }
    }
  }catch(err){
    console.warn("local auth cleanup failed",err);
  }

  location.replace("login.html?logged_out=1");
}

function bindCriticalUi(){
  const button=document.getElementById("logout");
  if(button && !button.dataset.bound){
    button.dataset.bound="1";
    button.addEventListener("click",handleLogout);
  }
  const badge=document.getElementById("auth-user");
  if(badge && badge.textContent.trim()==="確認中…") badge.textContent="ログイン情報を確認中";
}
bindCriticalUi();
document.addEventListener("DOMContentLoaded",bindCriticalUi);

async function load(){
  bindCriticalUi();
  const badge=document.getElementById("auth-user");
  let user=null;
  try{
    // サーバー側でJWTを検証してから管理画面を表示する。
    const {data,error}=await supabase.auth.getUser();
    if(error || !data?.user){
      location.replace("login.html?auth_required=1");
      return;
    }
    user=data.user;
  }catch(err){
    console.error("auth verification failed",err);
    location.replace("login.html?auth_required=1");
    return;
  }
  // セッション取得直後にメールアドレスを表示し、プロフィール取得中でも「確認中…」のままにしない
  const authUserBadge=document.getElementById("auth-user");
  if(authUserBadge) authUserBadge.textContent=user.email||"ログイン中";
  const {data:profile}=await supabase.from("profiles").select("display_name").eq("id",user.id).maybeSingle();
  const {data:member,error:memberError}=await supabase.from("management_members").select("role,is_active").eq("user_id",user.id).maybeSingle();
  if(memberError) {
    if(authUserBadge) authUserBadge.textContent=user.email||"ログイン中";
    throw new Error("権限情報を取得できませんでした。"); 
  }
  if(!member?.is_active){
    await supabase.auth.signOut({scope:"local"}).catch(()=>{});
    location.replace("login.html?unauthorized=1");
    return;
  }
  const role=member.role;
  const isTalent=role==="talent";
  const isManagement=!isTalent;
  // 認証・権限確認を通過するまでダッシュボードを見せない。
  document.body.classList.remove("auth-pending");

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
    supabase.from("schedules").select("id,title,starts_at,talent_id").gte("starts_at",new Date("2026-10-03T00:00:00+09:00").toISOString()).order("starts_at"),
    supabase.from("revenue_transactions").select("amount,transaction_type,talent_id").gte("occurred_on",new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10)),
    supabase.from("revenue_distributions").select("amount,status,talent_id").in("status",["calculated","approved","paid"]),
    supabase.from("contracts").select("id,title,ends_on,contract_status,talent_id").not("ends_on","is",null).order("ends_on"),
    supabase.from("activity_reports").select("id,talent_id,title,report_date,status,body,submitted_by").order("report_date",{ascending:false})
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
  const tokyoDateKey=(date=new Date())=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
  const todayKey=tokyoDateKey(),datePlusDays=n=>{const base=new Date(todayKey+"T00:00:00+09:00");base.setUTCDate(base.getUTCDate()+n);return tokyoDateKey(base)},in7Key=datePlusDays(7),in30Key=datePlusDays(30);
  const activeProjects=visibleProjects.filter(x=>!["completed","cancelled"].includes(x.status)).length;
  const expiring=visibleContracts.filter(x=>x.ends_on&&x.ends_on>=tokyoDateKey()&&x.ends_on<=datePlusDays(30)).length;

  const todayActions=[];
  visibleSchedules.filter(x=>tokyoDateKey(new Date(x.starts_at))===todayKey).forEach(x=>todayActions.push({kind:"予定",title:x.title,detail:new Date(x.starts_at).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit"})+" 開始",href:"#schedule",priority:1}));
  visibleContracts.filter(x=>x.ends_on&&x.ends_on>=todayKey&&x.ends_on<=in7Key).forEach(x=>todayActions.push({kind:"契約",title:x.title,detail:"7日以内 / 契約終了 "+x.ends_on,href:"#contracts",priority:2}));
  if(!isTalent) visibleReports.filter(x=>x.status==="submitted").forEach(x=>todayActions.push({kind:"活動報告",title:x.title,detail:"確認が必要 / "+x.report_date,href:"#reports",priority:2}));
  if(!isTalent) visibleProjects.filter(x=>x.status==="review").forEach(x=>todayActions.push({kind:"案件",title:x.title,detail:"確認待ち"+(x.due_date?" / 期限 "+x.due_date:""),href:"#projects",priority:2}));
  visibleProjects.filter(x=>x.due_date&&x.due_date<=todayKey&&!["completed","cancelled","review"].includes(x.status)).forEach(x=>todayActions.push({kind:"案件",title:x.title,detail:(x.due_date<todayKey?"期限超過":"本日期限")+" / "+(statusLabels[x.status]||x.status),href:"#projects",priority:0}));
  todayActions.sort((a,b)=>a.priority-b.priority||a.title.localeCompare(b.title,"ja"));
  const actionList=document.getElementById("today-actions-list"),actionCount=document.getElementById("today-actions-count");
  if(actionCount)actionCount.textContent=todayActions.length?todayActions.length+"件":"0件";
  if(actionList)actionList.innerHTML=todayActions.length?todayActions.map(x=>"<a class='today-action' href='"+x.href+"'><span class='today-action-kind'>"+esc(x.kind)+"</span><span><strong>"+esc(x.title)+"</strong><small>"+esc(x.detail)+"</small></span><b>›</b></a>").join(""):"<div class='today-clear'><strong>今日の優先タスクはありません</strong><span>新しい予定や確認事項が入るとここに表示されます。</span></div>";
  const upcomingContracts=visibleContracts.filter(x=>x.ends_on&&x.ends_on>=todayKey&&x.ends_on<=in30Key);

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

  const talentArea=document.getElementById("dashboard-talents");
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
  contractNotice.innerHTML=upcomingContracts.length?"<strong>"+(isTalent?"30日以内の契約更新":"30日以内の契約更新")+"</strong>"+upcomingContracts.map(x=>"<span>"+esc(x.title)+" — "+esc(x.ends_on||"期限未設定")+"</span>").join(""):"<strong>契約情報</strong><span>共有されている契約はありません。</span>";

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
  const memberSection=document.getElementById("members");
  if(memberSection && ["owner","admin"].includes(role)){
    const canManageMemberRoles=role==="owner";
    const {data:members}=await supabase.from("management_members").select("user_id,role,is_active");
    const {data:memberProfiles}=await supabase.from("profiles").select("id,display_name").order("display_name");
    const memberList=memberSection.querySelector(".member-list");
    memberList.innerHTML=(memberProfiles||[]).map(pf=>{const m=(members||[]).find(x=>x.user_id===pf.id);if(!m)return "";return "<div class='member-row'><span><strong>"+esc(pf.display_name||pf.id)+"</strong><small>"+esc(m.is_active?"有効":"無効")+"</small></span><select data-member-role='"+pf.id+"' "+(canManageMemberRoles?"":"disabled")+">"+["owner","admin","manager","accounting","legal","creative","talent"].map(v=>"<option value='"+v+"' "+(m.role===v?"selected":"")+">"+roleLabels[v]+"</option>").join("")+"</select></div>";}).join("")||"<p>運営メンバーはいません。</p>";
    if(canManageMemberRoles) memberList.querySelectorAll("[data-member-role]").forEach(sel=>sel.addEventListener("change",async()=>{const {error}=await supabase.from("management_members").update({role:sel.value}).eq("user_id",sel.dataset.memberRole);if(error){alert(error.message);load();}else load();}));
  } else if(memberSection){memberSection.remove();}

  async function setupCollaborationFeatures({user,role,ownTalent,visibleProjects,allTalents,visibleSchedules,isTalent}){
    const mgmt=["owner","admin","manager","creative"].includes(role);
    const $=(s)=>document.querySelector(s);
    const featureNav=[["#chat","チャット"],["#announcements","お知らせ"],["#comments","案件コメント"],["#files","ファイル共有"]];
    const nav=document.querySelector("nav");
    featureNav.forEach(([href,label])=>{if(!nav.querySelector('a[href="'+href+'"]')){const a=document.createElement("a");a.href=href;a.textContent=label;nav.appendChild(a);}});
    if(!document.getElementById("chat")){
      const main=document.querySelector("main");
      const mk=(id,kicker,title,html)=>{const s=document.createElement("section");s.id=id;s.innerHTML="<small>"+kicker+"</small><h2>"+title+"</h2>"+html;main.insertBefore(s,document.getElementById("versions"));return s;};
      mk("chat","CHAT","運営 ↔ タレント チャット",'<div class="collab-toolbar"><select id="chat-person"></select><button id="chat-new">新しいチャット</button></div><div id="chat-box" class="chat-box"><p>会話を選択してください。</p></div><form id="chat-form" class="inline-form chat-form"><textarea id="chat-message" placeholder="メッセージを入力…" required></textarea><button type="submit">送信</button></form>');
      mk("announcements","ANNOUNCEMENTS","お知らせ",'<div id="announcement-create"></div><div id="announcement-list" class="announcement-list"></div>');
      mk("comments","PROJECT COMMENTS","案件ごとのコメント",'<select id="comment-project"></select><div id="comment-list" class="comment-list"></div><form id="comment-form" class="inline-form"><textarea id="comment-body" placeholder="案件についてコメント…" required></textarea><button type="submit">コメントする</button></form>');
      mk("files","FILE SHARING","ファイル共有",'<form id="file-form" class="inline-form"><select id="file-project"></select><input id="file-input" type="file" required><button type="submit">アップロード</button></form><div id="file-list" class="file-list"></div>');
    }
    let currentConversation=null, chatChannel=null;
    const chatPerson=$("#chat-person"), chatBox=$("#chat-box");
    async function loadConversations(){
      const q=await supabase.from("talent_conversations").select("id,talent_id,title,updated_at,talents(name,stage_name)").order("updated_at",{ascending:false});
      if(q.error) throw q.error;
      chatPerson.innerHTML=(q.data||[]).map(c=>"<option value='"+c.id+"'>"+esc(c.talents?.stage_name||c.talents?.name||"タレント")+"</option>").join("");
      if(mgmt && !(q.data||[]).length){
        chatBox.innerHTML="<p>まだチャットはありません。「新しいチャット」から開始できます。</p>";
        return;
      }
      if(q.data?.length){currentConversation=q.data[0].id;chatPerson.value=currentConversation;await loadMessages();}
    }
    async function loadMessages(){
      if(!currentConversation)return;
      const q=await supabase.from("talent_messages").select("id,body,sender_user_id,created_at").eq("conversation_id",currentConversation).order("created_at",{ascending:true});
      if(q.error){chatBox.innerHTML="<p>メッセージを取得できませんでした。</p>";return;}
      chatBox.innerHTML=(q.data||[]).map(m=>"<div class='chat-message "+(m.sender_user_id===user.id?"mine":"")+"'><strong>"+(m.sender_user_id===user.id?"自分":"相手")+"</strong><p>"+esc(m.body)+"</p><small>"+new Date(m.created_at).toLocaleString("ja-JP")+"</small></div>").join("")||"<p>まだメッセージはありません。</p>";
      chatBox.scrollTop=chatBox.scrollHeight;
      if(chatChannel)await supabase.removeChannel(chatChannel);
      chatChannel=supabase.channel("talent-chat-"+currentConversation).on("postgres_changes",{event:"*",schema:"public",table:"talent_messages",filter:"conversation_id=eq."+currentConversation},()=>loadMessages()).subscribe();
    }
    chatPerson.onchange=async()=>{currentConversation=chatPerson.value;await loadMessages();};
    $("#chat-form").onsubmit=async e=>{e.preventDefault();if(!currentConversation){alert("チャットを選択してください。");return;}const body=$("#chat-message").value.trim();if(!body)return;const q=await supabase.from("talent_messages").insert({conversation_id:currentConversation,sender_user_id:user.id,body});if(q.error)alert(q.error.message);else{$("#chat-message").value="";await loadMessages();}};
    $("#chat-new").onclick=async()=>{
      if(!mgmt){return;}
      const unused=(allTalents||[]).filter(t=>!(chatPerson.querySelector("option[value]")&&[...chatPerson.options].some(o=>o.textContent===(t.stage_name||t.name))));
      const select=document.createElement("select");select.innerHTML="<option value=''>タレントを選択</option>"+(unused.length?unused:allTalents).map(t=>"<option value='"+t.id+"'>"+esc(t.stage_name||t.name)+"</option>").join("");
      if(!confirm("新しいチャットを作成します。タレント選択ダイアログを表示します。"))return;
      const talentId=prompt("タレントIDを入力してください:\n"+(allTalents||[]).map(t=>(t.stage_name||t.name)+" : "+t.id).join("\n"));
      if(!talentId)return;
      const q=await supabase.from("talent_conversations").insert({talent_id:talentId,created_by:user.id}).select("id").single();
      if(q.error)alert(q.error.message);else{await loadConversations();}
    };
    if(!mgmt)$("#chat-new").hidden=true;

    const annList=$("#announcement-list"), annCreate=$("#announcement-create");
    if(mgmt)annCreate.innerHTML='<form id="announcement-form" class="inline-form"><input id="announcement-title" placeholder="お知らせタイトル" required><textarea id="announcement-body" placeholder="内容" required></textarea><button type="submit">お知らせを公開</button></form>';
    async function loadAnnouncements(){
      const q=await supabase.from("announcements").select("id,title,body,published_at,created_by").order("published_at",{ascending:false}).limit(30);
      if(q.error)return;
      annList.innerHTML=(q.data||[]).map(a=>"<article><strong>"+esc(a.title)+"</strong><small>"+new Date(a.published_at).toLocaleString("ja-JP")+"</small><p>"+esc(a.body).replace(/\n/g,"<br>")+"</p></article>").join("")||"<p>お知らせはありません。</p>";
      if(q.data?.length) await supabase.from("announcement_reads").upsert(q.data.map(a=>({announcement_id:a.id,user_id:user.id})),{onConflict:"announcement_id,user_id"});
    }
    $("#announcement-form")?.addEventListener("submit",async e=>{e.preventDefault();const q=await supabase.from("announcements").insert({title:$("#announcement-title").value.trim(),body:$("#announcement-body").value.trim(),created_by:user.id});if(q.error)alert(q.error.message);else{e.target.reset();loadAnnouncements();}});
    
    const commentProject=$("#comment-project"), commentList=$("#comment-list");
    commentProject.innerHTML=(visibleProjects||[]).map(p=>"<option value='"+p.id+"'>"+esc(p.title)+"</option>").join("");
    async function loadComments(){
      const pid=commentProject.value;if(!pid){commentList.innerHTML="<p>コメント対象の案件がありません。</p>";return;}
      const q=await supabase.from("project_comments").select("id,body,author_user_id,created_at").eq("project_id",pid).order("created_at",{ascending:true});
      if(q.error){commentList.innerHTML="<p>コメントを取得できませんでした。</p>";return;}
      commentList.innerHTML=(q.data||[]).map(c=>"<article><strong>"+(c.author_user_id===user.id?"自分":"メンバー")+"</strong><small>"+new Date(c.created_at).toLocaleString("ja-JP")+"</small><p>"+esc(c.body).replace(/\n/g,"<br>")+"</p></article>").join("")||"<p>まだコメントはありません。</p>";
    }
    commentProject.onchange=loadComments;
    $("#comment-form").onsubmit=async e=>{e.preventDefault();const pid=commentProject.value;if(!pid)return;const q=await supabase.from("project_comments").insert({project_id:pid,author_user_id:user.id,body:$("#comment-body").value.trim()});if(q.error)alert(q.error.message);else{e.target.reset();loadComments();}};
    
    const fileProject=$("#file-project"), fileList=$("#file-list");
    fileProject.innerHTML=(visibleProjects||[]).map(p=>"<option value='"+p.id+"'>"+esc(p.title)+"</option>").join("");
    async function loadFiles(){
      const pid=fileProject.value;if(!pid){fileList.innerHTML="<p>共有対象の案件がありません。</p>";return;}
      const q=await supabase.from("shared_files").select("id,file_name,storage_path,content_type,size_bytes,uploader_user_id,created_at").eq("project_id",pid).order("created_at",{ascending:false});
      if(q.error){fileList.innerHTML="<p>ファイルを取得できませんでした。</p>";return;}
      fileList.innerHTML=(q.data||[]).map(f=>"<div class='file-row'><span><strong>"+esc(f.file_name)+"</strong><small>"+(f.size_bytes?Math.round(f.size_bytes/1024)+" KB":"")+" / "+new Date(f.created_at).toLocaleDateString("ja-JP")+"</small></span><button data-download='"+f.id+"' data-path='"+esc(f.storage_path)+"'>開く</button></div>").join("")||"<p>共有ファイルはありません。</p>";
      fileList.querySelectorAll("[data-download]").forEach(b=>b.onclick=async()=>{const s=await supabase.storage.from("talent-shared-files").createSignedUrl(b.dataset.path,300);if(s.error)alert(s.error.message);else window.open(s.data.signedUrl,"_blank","noopener");});
    }
    fileProject.onchange=loadFiles;
    $("#file-form").onsubmit=async e=>{e.preventDefault();const file=$("#file-input").files[0],pid=fileProject.value;if(!file||!pid)return;const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");const path=user.id+"/"+crypto.randomUUID()+"-"+safe;const up=await supabase.storage.from("talent-shared-files").upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false});if(up.error){alert(up.error.message);return;}const q=await supabase.from("shared_files").insert({project_id:pid,uploader_user_id:user.id,file_name:file.name,storage_path:path,content_type:file.type||null,size_bytes:file.size});if(q.error){await supabase.storage.from("talent-shared-files").remove([path]);alert(q.error.message);return;}e.target.reset();loadFiles();};
    
    const scheduleSection=document.getElementById("schedule");
    if(isTalent && ownTalent && visibleSchedules.length){
      const wrap=document.createElement("div");wrap.className="schedule-response-list";wrap.innerHTML=visibleSchedules.map(s=>"<div class='schedule-response' data-schedule='"+s.id+"'><div><strong>"+esc(s.title)+"</strong><small>"+new Date(s.starts_at).toLocaleString("ja-JP")+"</small></div><div><button data-response='yes'>参加</button><button data-response='no' class='secondary'>不参加</button><button data-response='maybe' class='secondary'>未定</button></div></div>").join("");
      scheduleSection.appendChild(wrap);
      const existing=await supabase.from("schedule_responses").select("schedule_id,response,note").eq("talent_id",ownTalent.id);
      (existing.data||[]).forEach(r=>{const row=wrap.querySelector('[data-schedule="'+r.schedule_id+'"]');if(row)row.dataset.response=r.response;});
      wrap.querySelectorAll("[data-response]").forEach(btn=>btn.onclick=async()=>{const row=btn.closest("[data-schedule]");const q=await supabase.from("schedule_responses").upsert({schedule_id:row.dataset.schedule,talent_id:ownTalent.id,response:btn.dataset.response,responded_at:new Date().toISOString()});if(q.error)alert(q.error.message);else{row.querySelectorAll("button").forEach(x=>x.classList.remove("selected"));btn.classList.add("selected");}});
    } else if(mgmt && visibleSchedules.length){
      const wrap=document.createElement("div");wrap.className="schedule-response-list";wrap.innerHTML="<h3>参加可否</h3>"+visibleSchedules.map(s=>"<div class='schedule-response'><div><strong>"+esc(s.title)+"</strong><small>"+new Date(s.starts_at).toLocaleString("ja-JP")+"</small></div><span data-responses='"+s.id+"'>読み込み中…</span></div>").join("");scheduleSection.appendChild(wrap);
      const q=await supabase.from("schedule_responses").select("schedule_id,talent_id,response,talents(stage_name,name)").in("schedule_id",visibleSchedules.map(s=>s.id));
      if(!q.error)q.data.forEach(r=>{const el=wrap.querySelector('[data-responses="'+r.schedule_id+'"]');if(el)el.textContent+=(el.textContent==="読み込み中…"?"": " / ")+(r.talents?.stage_name||r.talents?.name||"タレント")+"："+({yes:"参加",no:"不参加",maybe:"未定"}[r.response]||r.response);});
    }
    await Promise.all([loadConversations(),loadAnnouncements(),loadComments(),loadFiles()]);
  }

  await setupCollaborationFeatures({user,role,ownTalent,visibleProjects,allTalents,visibleSchedules,isTalent});
}
load().catch(err=>{
  console.error(err);
  const badge=document.getElementById("auth-user");
  if(badge && ["確認中…","ログイン情報を確認中"].includes(badge.textContent.trim())) badge.textContent="ログイン中";
  alert(err.message||"読み込みに失敗しました");
});