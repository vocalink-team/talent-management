import { supabase } from "./supabase-client.js";
const status=document.getElementById("status");
const registerButton=document.getElementById("register-passkey");
const list=document.getElementById("passkey-list");

async function loadPasskeys(){
  const {data:userData,error:userError}=await supabase.auth.getUser();
  if(userError || !userData?.user){location.replace("login.html?auth_required=1");return;}
  if(!window.PublicKeyCredential){
    status.textContent="このブラウザはPasskeyに対応していません。";
    registerButton.disabled=true;
    return;
  }
  try{
    const {data,error}=await supabase.auth.passkey.list();
    if(error) throw error;
    const passkeys=Array.isArray(data)?data:(data?.passkeys||[]);
    status.textContent=passkeys.length?"Passkeyが登録されています。":"Passkeyはまだ登録されていません。";
    list.innerHTML="";
    for(const item of passkeys){
      const row=document.createElement("div");
      row.className="notice";
      const name=document.createElement("strong");
      name.textContent=item.friendly_name||"Passkey";
      const meta=document.createElement("span");
      meta.textContent=item.last_used_at?"最終利用: "+new Date(item.last_used_at).toLocaleString("ja-JP"):"登録済み";
      const del=document.createElement("button");
      del.type="button";
      del.className="secondary";
      del.textContent="削除";
      del.addEventListener("click",async()=>{
        if(!confirm("このPasskeyを削除しますか？")) return;
        del.disabled=true;
        const {error}=await supabase.auth.passkey.delete({passkeyId:item.id});
        if(error){status.textContent=error.message;del.disabled=false;return;}
        await loadPasskeys();
      });
      row.append(name,meta,del);
      list.appendChild(row);
    }
  }catch(err){
    console.error("Passkey list failed",err);
    status.textContent=err?.code==="passkey_disabled"
      ?"Supabase側のPasskey機能がまだ有効化されていません。"
      :(err?.message||"Passkey情報を取得できませんでした。");
  }
}

registerButton.addEventListener("click",async()=>{
  registerButton.disabled=true;
  status.textContent="端末の認証画面を確認してください…";
  try{
    const {data,error}=await supabase.auth.registerPasskey();
    if(error) throw error;
    status.textContent="Passkeyを登録しました。";
    await loadPasskeys();
  }catch(err){
    console.error("Passkey registration failed",err);
    status.textContent=err?.code==="passkey_disabled"
      ?"Supabase側のPasskey機能がまだ有効化されていません。"
      :(err?.message||"Passkeyの登録に失敗しました。");
  }finally{registerButton.disabled=false;}
});
loadPasskeys();
