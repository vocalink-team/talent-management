import { supabase } from "./supabase-client.js";
const status=document.getElementById("status"), enrollBox=document.getElementById("enroll"), form=document.getElementById("verify-form"), code=document.getElementById("code");
let factorId=null;
const {data:{session}}=await supabase.auth.getSession();
if(!session) location.replace("login.html");
const {data:factors,error:listError}=await supabase.auth.mfa.listFactors();
if(listError) throw listError;
const verified=(factors?.totp||[]).find(f=>f.status==="verified");
if(verified){
  factorId=verified.id;
  const {data:aal}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if(aal?.currentLevel==="aal2"){status.textContent="MFA認証済みです。";setTimeout(()=>location.replace("index.html"),500);}
  else{status.textContent="認証アプリの6桁コードを入力してください。";form.hidden=false;}
}else{
  status.textContent="MFAを登録してください。";
  const {data,error}=await supabase.auth.mfa.enroll({factorType:"totp",friendlyName:"VOCALINK Talent Management"});
  if(error) throw error;
  factorId=data.id; enrollBox.hidden=false; form.hidden=false;
  document.getElementById("qr").innerHTML=data.totp.qr_code;
  document.getElementById("secret").textContent=data.totp.secret;
}
form.addEventListener("submit",async e=>{e.preventDefault();status.textContent="確認中…";try{
  const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId}); if(challengeError)throw challengeError;
  const {error}=await supabase.auth.mfa.verify({factorId,challengeId:challenge.id,code:code.value}); if(error)throw error;
  status.textContent="MFA認証が完了しました。"; location.replace("index.html");
}catch(err){status.textContent=err?.message||"MFA認証に失敗しました。";}});
