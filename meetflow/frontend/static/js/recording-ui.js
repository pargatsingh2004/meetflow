"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const codeNode = document.getElementById("room-code-data");
    const panel = document.getElementById("mfRecordingPanel");
    if (!codeNode || !panel || !window.MeetFlow) return;
    let code;
    try { code = JSON.parse(codeNode.textContent); } catch { return; }
    const $ = id => document.getElementById(id);
    const url = action => `/api/meetings/${encodeURIComponent(code)}/recording/${action}/`;
    let host = false;
    let pending = false;
    let last = null;
    let timer = null;
    let polling = false;
    let recordingEnabled = false;
    const setVisible = (id, yes) => { const e = $(id); if (e) e.hidden = !yes; };
    const message = text => { $("mfRecStatus").textContent = text; };
    const toast = (text, kind="warning") => MeetFlow.showToast(text, kind);
    const errorText = e => e?.message || String(e);

    function render(data) {
        last = data;
        const status = data.status || "none";
        const active = ["recording", "starting", "stopping"].includes(status);
        setVisible("mfRecLive", active);
        if (active && data.started_at) {
            const started = Date.parse(data.started_at);
            const elapsed = Math.max(0, Math.floor((Date.now() - started) / 1000));
            const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
            const s = String(elapsed % 60).padStart(2, "0");
            $("mfRecTimer").textContent = `${m}:${s}`;
        }
        setVisible("mfRecConsent", status === "waiting" && data.requires_consent);
        setVisible("mfRecRequest", host && status === "none" && recordingEnabled);
        setVisible("mfRecStart", host && status === "waiting" && data.total > 0 && data.approved === data.total);
        setVisible("mfRecStop", host && status === "recording");
        setVisible("mfRecCancel", host && status === "waiting");
        setVisible("mfRecHistoryButton", host);
        const labels = {
            none: recordingEnabled ? "No active server-side recording." : "Server-side recording is disabled. Local screen recording is still available.",
            waiting: `Waiting for participant consent (${data.approved || 0}/${data.total || 0} approved).`,
            starting: "Starting LiveKit Egress recording…",
            recording: "This meeting is being recorded. Audio and video may be included.",
            stopping: "Stopping recording; waiting for file finalization…"
        };
        message(labels[status] || `Recording status: ${status}`);
    }

    async function refresh() {
        if (polling || document.hidden) return;
        polling = true;
        try {
            const data = await MeetFlow.request(url("status"));
            render(data);
        } catch (e) {
            if (!panel.hidden) message(`Recording status unavailable: ${errorText(e)}`);
        } finally { polling = false; }
    }

    async function post(action, body) {
        if (pending) return;
        pending = true;
        for (const id of ["mfRecRequest", "mfRecStart", "mfRecStop", "mfRecCancel", "mfRecAccept", "mfRecDecline"]) {
            if ($(id)) $(id).disabled = true;
        }
        try {
            const result = await MeetFlow.request(url(action), {
                method: "POST",
                ...(body ? { body: JSON.stringify(body) } : {})
            });
            toast(result.detail || "Recording request updated.", "success");
        } catch (e) {
            toast(`Recording: ${errorText(e)}`, "error");
        } finally {
            pending = false;
            for (const id of ["mfRecRequest", "mfRecStart", "mfRecStop", "mfRecCancel", "mfRecAccept", "mfRecDecline"]) {
                if ($(id)) $(id).disabled = false;
            }
            await refresh();
        }
    }

    async function history() {
        const box = $("mfRecHistory");
        box.hidden = !box.hidden;
        if (box.hidden) return;
        box.textContent = "Loading recording history…";
        try {
            const rows = await MeetFlow.request(url("history"));
            box.replaceChildren();
            if (!rows.length) { box.textContent = "No recordings yet."; return; }
            for (const rec of rows) {
                const line = document.createElement("div");
                line.className = "d-flex align-items-center gap-2 justify-content-between border-bottom py-2";
                const label = document.createElement("span");
                label.textContent = `${rec.started_at ? new Date(rec.started_at).toLocaleString() : "Not started"} — ${rec.status}`;
                line.appendChild(label);
                if (rec.status === "completed") {
                    const button = document.createElement("button");
                    button.className = "btn btn-sm btn-outline-primary";
                    button.type = "button";
                    button.textContent = "Download";
                    button.addEventListener("click", async () => {
                        try {
                            const data = await MeetFlow.request(url(`${rec.id}/download`));
                            if (data.download_url) window.open(data.download_url, "_blank", "noopener,noreferrer");
                        } catch (e) { toast(errorText(e), "error"); }
                    });
                    line.appendChild(button);
                }
                box.appendChild(line);
            }
        } catch (e) { box.textContent = `Unable to load history: ${errorText(e)}`; }
    }

    $("mfRecRequest")?.addEventListener("click", () => post("request"));
    $("mfRecStart")?.addEventListener("click", () => post("start"));
    $("mfRecStop")?.addEventListener("click", () => {
        if (confirm("Stop the meeting recording?")) post("stop");
    });
    $("mfRecAccept")?.addEventListener("click", () => post("consent", {accepted: true}));
    $("mfRecDecline")?.addEventListener("click", () => post("consent", {accepted: false}));
    $("mfRecCancel")?.addEventListener("click", () => post("cancel"));
    $("mfRecHistoryButton")?.addEventListener("click", history);

    async function initialize() {
        try {
            const meeting = await MeetFlow.request(MeetFlow.API.meetingDetail(code));
            host = Boolean(meeting.is_host);
            recordingEnabled = true; // The server will enforce LIVEKIT_RECORDING_ENABLED.
            panel.hidden = false;
            if (host && !$("mfRecCancel")) {
                const cancel = document.createElement("button");
                cancel.id = "mfRecCancel";
                cancel.type = "button";
                cancel.className = "btn btn-sm btn-outline-secondary";
                cancel.textContent = "Cancel consent request";
                cancel.hidden = true;
                $("mfRecStart").after(cancel);
                cancel.addEventListener("click", () => post("cancel"));
            }
            await refresh();
            timer = setInterval(refresh, 3000);
        } catch (e) { console.warn("Recording UI initialization:", e); }
    }
    window.addEventListener("pagehide", () => { if (timer) clearInterval(timer); });
    initialize();
});