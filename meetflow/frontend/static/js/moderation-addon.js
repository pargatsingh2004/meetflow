"use strict";
/* Standalone UI for MeetFlow's authenticated moderation API. */
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const code = JSON.parse($("room-code-data")?.textContent || '""');
  if (!code || !window.MeetFlow) return;
  const base = `/api/meetings/${encodeURIComponent(code)}/moderation/`;
  const notice = message => { if ($("mfModerationNotice")) $("mfModerationNotice").textContent = message; };
  let currentRole = "attendee", locked = false;
  async function action(payload) {
    try { await MeetFlow.request(base, {method: "POST", body: JSON.stringify(payload)}); await refresh(); }
    catch (e) { notice(e.message || "Unable to update meeting."); }
  }
  function button(text, onClick) {
    const b = document.createElement("button"); b.type="button"; b.className="btn btn-outline-secondary btn-sm m-1";
    b.textContent=text; b.addEventListener("click",onClick); return b;
  }
  async function refresh() {
    try {
      const data = await MeetFlow.request(base);
      currentRole=data.role; locked=data.locked;
      const moderator = currentRole === "host" || currentRole === "cohost";
      $("mfMuteAll")?.classList.toggle("d-none", !moderator);
      $("mfToggleLock")?.classList.toggle("d-none", !moderator);
      if ($("mfToggleLock")) $("mfToggleLock").textContent=locked?"Unlock meeting":"Lock meeting";
      const queue=$("mfHandsQueue"); queue.replaceChildren();
      if (!data.hands.length) queue.textContent="No raised hands.";
      for (const h of data.hands) {
        const row=document.createElement("div"); row.textContent=h.name+" · "+new Date(h.raised_at).toLocaleTimeString();
        if (moderator) row.append(button("Lower hand",()=>action({action:"lower_hand",identity:h.identity})));
        queue.append(row);
      }
      const roles=$("mfRoles"); roles.replaceChildren();
      if (currentRole!=="host") {roles.textContent="Only the host can assign co-hosts.";return;}
      // Participant identity values come from the already-rendered meeting participant list.
      const list=$("participantsList");
      const names=[...list?.querySelectorAll(".participant-item")||[]];
      roles.textContent="Use a participant's numeric identity to grant/revoke co-host access: ";
      const field=document.createElement("input"); field.type="number";field.min="1";field.placeholder="Participant user ID";field.className="form-control form-control-sm my-1";roles.append(field);
      roles.append(button("Make co-host",()=>action({action:"set_role",identity:field.value,role:"cohost"})));
      roles.append(button("Make attendee",()=>action({action:"set_role",identity:field.value,role:"attendee"})));
    } catch (e) { notice(e.message || "Moderation unavailable."); }
  }
  $("mfRaiseHand")?.addEventListener("click",()=>action({action:"raise_hand"}));
  $("mfLowerHand")?.addEventListener("click",()=>action({action:"lower_hand"}));
  $("mfMuteAll")?.addEventListener("click",()=>action({action:"mute_all"}));
  $("mfToggleLock")?.addEventListener("click",()=>action({action:locked?"unlock":"lock"}));
  refresh(); setInterval(()=>{if(!document.hidden) refresh();},7000);
});
