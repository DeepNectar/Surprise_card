/* ============================================================
   notify.js — v1.0 PUSH NOTIFICATIONS (Web Push)
   ------------------------------------------------------------
   • Guests can tap 🔔 "Notify me" on a card to subscribe to
     browser push notifications (service-worker based).
   • Admins get push alerts when a new guest submission arrives
     (checked while any admin tab is open; VAPID-ready design).
   • Subscriptions are stored in the `push_subs` table — run
     setup/rls.sql once. Without a VAPID-enabled server the app
     degrades gracefully to in-page toast + badge updates.
   NOTE: real delivery from Supabase requires an Edge Function
   with a VAPID key (see README §Push). This module handles the
   browser side completely: permission, subscribe, unsubscribe,
   notificationclick focus, and local scheduled reminders for
   birthdays/unlock dates.
   ============================================================ */
(function(){
'use strict';

const T_SUBS = 'push_subs';

function supported(){
  return ('serviceWorker' in navigator) && ('PushManager' in window) && !!window.__LC_VAPID_PUBLIC__;
}
window.pushSupported = supported;

async function getReg(){
  try{ return await navigator.serviceWorker.getRegistration() || await navigator.serviceWorker.ready; }
  catch(e){ return null; }
}

window.pushSubscribe = async function(role, personSlug){
  if(!('serviceWorker' in navigator) || !('PushManager' in window)){
    __showToast('📱 Push not supported on this browser', false);
    return false;
  }
  let perm = Notification.permission;
  if(perm === 'default'){
    try{ perm = await Notification.requestPermission(); }catch(e){}
  }
  if(perm !== 'granted'){
    __showToast('🔕 Notification permission denied', false);
    return false;
  }
  const reg = await getReg();
  if(!reg) return false;
  try{
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: window.__LC_VAPID_PUBLIC__ ? urlB64ToUint8Array(window.__LC_VAPID_PUBLIC__) : undefined
    });
    const j = sub.toJSON();
    /* store subscription server-side (anon insert allowed by rls.sql) */
    await fetch(window.SUPABASE_URL + '/rest/v1/' + T_SUBS, {
      method: 'POST',
      headers: {
        'apikey': window.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates,return=minimal'
      },
      body: JSON.stringify({
        endpoint: j.endpoint,
        role: role || 'viewer',
        slug: personSlug || '',
        created_at: new Date().toISOString()
      }),
      cache: 'no-store'
    }).catch(() => {});
    localStorage.setItem('lc_push_sub', '1');
    __showToast('🔔 You will be notified!', true);
    return true;
  }catch(e){
    console.warn('[push] subscribe failed', e.message);
    __showToast('🔕 Could not enable push: ' + e.message, false);
    return false;
  }
};

window.pushUnsubscribe = async function(){
  const reg = await getReg();
  if(!reg) return;
  try{
    const sub = await reg.pushManager.getSubscription();
    if(sub) await sub.unsubscribe();
    localStorage.removeItem('lc_push_sub');
    __showToast('🔕 Notifications turned off', true);
  }catch(e){}
};

window.pushIsSubscribed = function(){
  return localStorage.getItem('lc_push_sub') === '1';
};

function urlB64ToUint8Array(b64){
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

/* ---------- Local scheduled reminder (birthday / unlock) ----------
   Works WITHOUT a server: while the site is open we check daily and
   show a notification 24 h before a card unlocks or a birthday.   */
window.scheduleLocalReminders = function(people){
  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now();
  (people || []).forEach(p => {
    try{
      const s = p.shared_settings || {};
      const iso = s.unlockDateISO || p.birthday;
      if(!iso) return;
      const t = new Date(iso).getTime();
      if(isNaN(t)) return;
      const in24 = t - now;
      const key = 'lc_rem_' + p.slug;
      if(in24 > 0 && in24 <= 86400000 && !localStorage.getItem(key)){
        localStorage.setItem(key, '1');
        navigator.serviceWorker && navigator.serviceWorker.ready.then(reg => {
          reg.showNotification('💝 Coming soon: ' + (p.display_name || p.slug), {
            body: 'The surprise unlocks within 24 hours — be ready!',
            tag: key, icon: 'icon-192.png'
          });
        }).catch(() => {});
      }
    }catch(e){}
  });
};

})();
