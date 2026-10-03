import { supabase } from "./supabase-client.js";
const status=document.getElementById("status");
const enrollBox=document.getElementById("enroll");
const form=document.getElementById("verify-form");
const code=document.getElementById("code");
let factorId=null;

async function initMfa(){
  try{
    const {data:userData,error:userError}=await supabase.auth.getUser();
    if(userError || !userData?.user){location.replace("login.html?auth_required=1");return;}

    const {data:factors,error:listError}=await supabase.auth.mfa.listFactors();
    if(listError) throw listError;
    const verified=(factors?.totp||[]).find(f=>f.status==="verified");
    if(verified){
      factorId=verified.id;
      const {data:aal,error:aalError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if(aalError) throw aalError;
      if(aal?.currentLevel==="aal2"){
        status.textContent="MFA認証済みです。";
        setTimeout(()=>location.replace("index.html"),500);
        return;
      }
      status.textContent="認証アプリの6桁コードを入力してください。";
      form.hidden=false;
      return;
    }

    status.textContent="MFAを登録してください。";
    const {data,error}=await supabase.auth.mfa.enroll({factorType:"totp",friendlyName:"VOCALINK Talent Management"});
    if(error) throw error;
    factorId=data.id;
    enrollBox.hidden=false;
    form.hidden=false;
    document.getElementById("qr").innerHTML=data.totp.qr_code;
    document.getElementById("secret").textContent=data.totp.secret;
  }catch(err){
    console.error("MFA initialization failed",err);
    status.textContent=err?.message||"MFA設定の読み込みに失敗しました。";
  }
}

form.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!factorId){status.textContent="MFA情報を取得できません。ページを再読み込みしてください。";return;}
  status.textContent="確認中…";
  try{
    const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId});
    if(challengeError) throw challengeError;
    const {error}=await supabase.auth.mfa.verify({factorId,challengeId:challenge.id,code:code.value});
    if(error) throw error;
    status.textContent="MFA認証が完了しました。";
    location.replace("index.html");
  }catch(err){
    console.error("MFA verification failed",err);
    status.textContent=err?.message||"MFA認証に失敗しました。";
  }
});

initMfa();
