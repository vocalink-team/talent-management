import { supabase } from "./supabase-client.js";

const form=document.getElementById("auth-form");
const toggle=document.getElementById("toggle");
const submit=document.getElementById("submit");
const nameWrap=document.getElementById("name-wrap");
const message=document.getElementById("message");
let signup=false;

toggle.addEventListener("click",()=>{signup=!signup;nameWrap.hidden=!signup;submit.textContent=signup?"新規登録":"ログイン";toggle.textContent=signup?"ログインに切り替え":"新規登録に切り替え";message.textContent="";});
form.addEventListener("submit",async e=>{e.preventDefault();message.textContent="処理中…";submit.disabled=true;try{const email=document.getElementById("email").value.trim();const password=document.getElementById("password").value;if(signup){const displayName=document.getElementById("display-name").value.trim();const redirectUrl=new URL("login.html",location.href).href;const {data,error}=await supabase.auth.signUp({email,password,options:{data:{display_name:displayName||undefined},emailRedirectTo:redirectUrl}});if(error)throw error;if(!data.session){message.textContent="登録しました。確認メールを確認してからログインしてください。";}else{location.replace("index.html");}}else{const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;if(!data.session)throw new Error("ログインセッションを作成できませんでした。もう一度お試しください。");location.replace("index.html");}}catch(err){console.error(err);message.textContent=err?.message||"認証に失敗しました。";}finally{submit.disabled=false;}});

(async()=>{
  const params=new URLSearchParams(location.search);
  if(params.get("logged_out")==="1"){
    history.replaceState(null,"",location.pathname);
    message.textContent="ログアウトしました。";
    return;
  }
  if(params.get("auth_required")==="1") message.textContent="ログインが必要です。";
  if(params.get("unauthorized")==="1") message.textContent="このアカウントには管理画面の利用権限がありません。";
  const {data,error}=await supabase.auth.getUser();
  if(!error && data?.user) location.replace("index.html");
})();