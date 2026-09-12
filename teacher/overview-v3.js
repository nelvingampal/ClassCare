/* First integration slice: move the existing live care surface to its existing route.
   This changes presentation order only; its listeners, data and actions remain intact. */
(function(){
  'use strict';
  function placeLiveCare(){
    const live=document.getElementById('holistic-live');
    const destination=document.getElementById('tab-teacher-care-alerts');
    if(live&&destination&&live.parentElement!==destination){
      destination.prepend(live);
    }
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const dashboard=document.getElementById('view-dashboard');
    if(!dashboard)return;
    placeLiveCare();
    new MutationObserver(placeLiveCare).observe(dashboard,{childList:true,subtree:true});
  });
})();
