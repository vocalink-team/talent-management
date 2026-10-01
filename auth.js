import { supabase } from "./supabase-client.js";

const form=document.getElementById("auth-form");
const toggle=document.getElementById("toggle");
const submit=document.getElementById("submit");
const nameWrap=document.getElementById("name-wrap");
const message=document.getElementById("message");
let signup=false;

toggle.addEventListener("click",()=>{signup=!signup;nameWrap.hidden=!signup;submit.textContent=signup?"新規登録":"ログイン";toggle.textContent=signup?"ログインに切り替え":"新規登録に切り替え";message.textContent="";});
form.addEventListener("submit",async e=>{e.preventDefault();message.textContent="処理中…";submit.disabled=true;try{const email=document.getElementById("email").value.trim();const password=document.getElementById("password").value; if(signup){const displayName=document.getElementById("display-name").value.trim();const redirectUrl=new URL("login.html",location.href).href; const {data,error}=await supabase.auth.signUp({email,password,options:{data:{display_name:displayName||undefined},emailRedirectTo:redirectUrl}});if(error)throw error;if(!data.session){message.textContent="登録しました。確認メールを確認してからログインしてください。";}else{location.href="index.html";}}else{const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;location.href="index.html";}}catch(err){message.textContent=err?.message||"認証に失敗しました。";}finally{submit.disabled=false;}});
(async()=>{const {data:{session}}=await supabase.auth.getSession();if(session) location.href="index.html";})();
