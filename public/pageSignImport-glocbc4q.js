import{a as o,A as s,_ as r,S as m}from"./index-XmtFSFF8.js";import{p as h}from"./putPreloader-YS_c8qIb.js";import{P as d}from"./page-k3Sy1wza.js";let i;const g=async()=>{const{dcId:e,token:u,tgAddr:n}=i;let a;try{o.managers.apiManager.setBaseDcId(e);const t=await o.managers.apiManager.invokeApi("auth.importWebTokenAuthorization",{api_id:s.id,api_hash:s.hash,web_auth_token:u},{dcId:e,ignoreErrors:!0});t._==="auth.authorization"&&(await o.managers.apiManager.setUser(t.user),a=r(()=>import("./pageIm-9DgeExxT.js"),__vite__mapDeps([0,1,2,3]),import.meta.url))}catch(t){switch(t.type){case"SESSION_PASSWORD_NEEDED":{t.handled=!0,a=r(()=>import("./pagePassword-SvLwSWPe.js"),__vite__mapDeps([4,1,2,5,3,6,7,8,9]),import.meta.url);break}default:{console.error("authorization import error:",t);const p=m.authState._;p==="authStateSignIn"?a=r(()=>import("./pageSignIn-dLaamoT-.js"),__vite__mapDeps([10,1,2,5,3,11,6,8,12,13,14]),import.meta.url):p==="authStateSignQr"&&(a=r(()=>import("./pageSignQR-_z8EL6RZ.js").then(_=>_.a),__vite__mapDeps([13,1,2,3,6,5,14]),import.meta.url));break}}}location.hash=n?.trim()?"#?tgaddr="+encodeURIComponent(n):"",a&&a.then(t=>t.default.mount())},l=new d("page-signImport",!0,()=>{h(l.pageEl.firstElementChild,!0),g()},e=>{i=e,o.managers.appStateManager.pushToState("authState",{_:"authStateSignImport",data:i})});export{l as default};
//# sourceMappingURL=pageSignImport-glocbc4q.js.map
function __vite__mapDeps(indexes) {
  if (!__vite__mapDeps.viteFileDeps) {
    __vite__mapDeps.viteFileDeps = ["./pageIm-9DgeExxT.js","./index-XmtFSFF8.js","./index--MFoqB-C.css","./page-k3Sy1wza.js","./pagePassword-SvLwSWPe.js","./putPreloader-YS_c8qIb.js","./button-jZCFJLEE.js","./htmlToSpan-DUz25rMy.js","./wrapEmojiText-8Jlqdnti.js","./loginPage-rtLQE3q-.js","./pageSignIn-dLaamoT-.js","./countryInputField-4MK6oMnD.js","./scrollable-zlzMt7vT.js","./pageSignQR-_z8EL6RZ.js","./textToSvgURL-Z4O-nL1S.js"]
  }
  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])
}