
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    if (!MeetFlow.requireAuth()) return;

    const $ = id => document.getElementById(id);
    const codeElement = $("room-code-data");

    if (!codeElement) {
        console.error("Meeting room code is missing.");
        return;
    }

    let roomCode;

    try {
        roomCode = JSON.parse(codeElement.textContent);
    } catch (error) {
        console.error("Invalid meeting code:", error);
        return;
    }

    const LK = window.LivekitClient;
    const encodedCode = encodeURIComponent(roomCode);

    const admissionUrl =
        `/api/meetings/${encodedCode}/admission/`;

    const admissionsUrl =
        `/api/meetings/${encodedCode}/admissions/`;

    const MEDIA_REQUEST_TOPIC = "meetflow.media.request";
    const MEDIA_REPLY_TOPIC = "meetflow.media.reply";
    const CHAT_TOPIC = "meetflow-chat";
    const CHAT_CONTROL_TOPIC = "meetflow.chat.control";

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let room = null;
    let connecting = false;
    let leaving = false;
    let joinAttempt = 0;
    let everConnected = false;
    let currentUserIsHost = false;
    let hostControlsBound = false;

    let timerId = null;
    let joinedAt = null;
    let lifecyclePolling = null;
    let hostPolling = null;
    let admissionPolling = null;

    let microphoneBusy = false;
    let cameraBusy = false;
    let screenShareBusy = false;
    let mediaRequestBusy = false;
    let unreadChatCount = 0;
    let chatEnabled = true;
    let chatBubblesEnabled = false;
    let mediaRequestQueue = Promise.resolve();

    let verifiedHostIdentity = null;
    let activeMediaPopup = null;

    let screenRecorder = null;
    let recordingStream = null;
    let recordedChunks = [];

    const remoteTiles = new Map();
    const processedMediaRequests = new Set();
    const pendingHostRequests = new Map();

    const admissionPanel = document.createElement("section");

    admissionPanel.className = "meetflow-admission-panel";
    admissionPanel.setAttribute("aria-live", "polite");

    document.querySelector(".meeting-header")
        ?.appendChild(admissionPanel);

    // =====================================================
    // GENERAL HELPERS
    // =====================================================

    function errorMessage(error) {
        return error?.message || String(error || "Unknown error");
    }

    function isConnected() {
        return Boolean(
            LK &&
            room &&
            !leaving &&
            room.state === "connected"
        );
    }

    function toast(message, kind = "info") {
        MeetFlow.showToast(message, kind);
    }

    function setConnection(message, kind = "secondary") {
        const badge = $("connectionStatus");

        if (!badge) return;

        badge.className = `badge text-bg-${kind}`;
        badge.textContent = message;
    }

    function participantName(participant) {
        return participant?.name ||
            participant?.identity ||
            "Participant";
    }

    function setControl(id, enabled, onIcon, offIcon) {
        const button = $(id);

        if (!button) return;

        button.classList.toggle("active", enabled);
        button.classList.toggle("off", !enabled);
        button.setAttribute("aria-pressed", String(enabled));

        button.innerHTML =
            `<i class="bi bi-${enabled ? onIcon : offIcon}"></i>`;
    }

    function refreshMediaControls() {
        const connected = isConnected();

        if ($("micBtn")) {
            $("micBtn").disabled =
                !connected || microphoneBusy;
        }

        if ($("cameraBtn")) {
            $("cameraBtn").disabled =
                !connected || cameraBusy;
        }

        if ($("screenShareBtn")) {
            $("screenShareBtn").disabled =
                !connected || screenShareBusy;
        }
    }

    function requireConnection(action) {
        if (isConnected()) return true;

        toast(
            `Cannot ${action}. Meeting is not connected.`,
            "warning"
        );

        return false;
    }

    function stopPolling() {
        for (const timer of [
            lifecyclePolling,
            hostPolling,
            admissionPolling
        ]) {
            if (timer) clearInterval(timer);
        }

        lifecyclePolling = null;
        hostPolling = null;
        admissionPolling = null;
    }

    // =====================================================
    // CONNECTION RETRY
    // =====================================================

    function showRetryButton() {
        let button = $("retryMeetingConnectionBtn");

        if (!button) {
            button = document.createElement("button");

            button.id = "retryMeetingConnectionBtn";
            button.type = "button";
            button.className =
                "btn btn-sm btn-outline-primary ms-2";

            button.textContent = "Retry connection";

            button.addEventListener(
                "click",
                connectMeeting
            );

            $("connectionStatus")
                ?.parentElement
                ?.appendChild(button);
        }

        button.classList.remove("d-none");
        button.disabled = connecting;
    }

    function hideRetryButton() {
        $("retryMeetingConnectionBtn")
            ?.classList.add("d-none");
    }

    // =====================================================
    // REMOTE PARTICIPANT VIDEO TILES
    // =====================================================

    function updateWaiting() {
        const waiting = $("waitingMessage");

        if (!waiting) return;

        waiting.classList.toggle(
            "d-none",
            Boolean(room?.remoteParticipants.size)
        );
    }

    function createRemoteTile(participant) {
        const identity = participant.identity;

        if (remoteTiles.has(identity)) {
            return remoteTiles.get(identity);
        }

        const tile = document.createElement("div");
        tile.className = "video-tile";
        tile.dataset.identity = identity;

        const content = document.createElement("div");
        content.className = "video-content";

        const avatar = document.createElement("div");
        avatar.className = "participant-avatar";

        avatar.innerHTML =
            '<i class="bi bi-person-fill"></i>';

        const footer = document.createElement("div");
        footer.className = "video-tile-footer";

        const name = document.createElement("span");
        name.textContent = participantName(participant);

        const mic = document.createElement("span");
        mic.innerHTML =
            '<i class="bi bi-mic-mute-fill"></i>';

        footer.append(name, mic);
        content.appendChild(avatar);
        tile.append(content, footer);

        $("remoteVideos")?.appendChild(tile);

        const entry = {
            tile,
            content,
            avatar,
            mic,
            tracks: new Map()
        };

        remoteTiles.set(identity, entry);

        return entry;
    }

    function updateRemoteAudioIndicator(participant) {
        const entry = remoteTiles.get(
            participant.identity
        );

        if (!entry) return;

        const publication =
            participant.getTrackPublication(
                LK.Track.Source.Microphone
            );

        const enabled = Boolean(
            publication && !publication.isMuted
        );

        entry.mic.innerHTML = enabled
            ? '<i class="bi bi-mic-fill"></i>'
            : '<i class="bi bi-mic-mute-fill"></i>';
    }

    // =====================================================
    // AUTO-PIN SCREEN SHARING (LOCAL AND REMOTE)
    // =====================================================

    const presentationTracks = new Map();

    let activePresentationKey = null;
    let pinnedPresentation = true;

    function isScreenPublication(publication) {
        return publication?.source ===
            LK.Track.Source.ScreenShare;
    }

    function ensurePresentationUI() {
        let stage = $("mfPresentation");
        let media = $("mfPresentationMedia");
        let pin = $("mfPresentationPin");
        let label = $("mfPresentationName");

        if (!stage) {
            stage = document.createElement("section");

            stage.id = "mfPresentation";
            stage.className = "mf-presentation";
            stage.hidden = true;

            stage.setAttribute(
                "aria-label",
                "Shared screen presentation"
            );

            const header =
                document.createElement("div");

            header.className =
                "mf-presentation-header";

            label = document.createElement("span");
            label.id = "mfPresentationName";

            pin = document.createElement("button");

            pin.id = "mfPresentationPin";
            pin.type = "button";
            pin.className = "mf-presentation-pin";

            header.append(label, pin);

            media = document.createElement("div");

            media.id = "mfPresentationMedia";
            media.className = "mf-presentation-media";

            stage.append(header, media);

            const grid =
                $("videoGrid") ||
                $("remoteVideos") ||
                $("localVideo")?.closest(".video-tile");

            if (grid?.parentElement) {
                grid.parentElement.insertBefore(
                    stage,
                    grid
                );
            } else {
                document.querySelector(".video-area")
                    ?.prepend(stage);
            }
        }

        if (pin && !pin.dataset.mfBound) {
            pin.dataset.mfBound = "true";

            pin.addEventListener("click", () => {
                pinnedPresentation = !pinnedPresentation;
                syncPresentation();
            });
        }

        return {
            stage,
            media,
            pin,
            label
        };
    }

    function syncPresentation() {
        const {
            stage,
            pin,
            label
        } = ensurePresentationUI();

        if (!stage) return;

        if (!presentationTracks.has(
            activePresentationKey
        )) {
            const keys = [
                ...presentationTracks.keys()
            ];

            activePresentationKey = keys.length
                ? keys[keys.length - 1]
                : null;
        }

        const active = presentationTracks.get(
            activePresentationKey
        );

        stage.hidden = !active;

        stage.classList.toggle(
            "mf-presentation-unpinned",
            Boolean(active && !pinnedPresentation)
        );

        const grid =
            $("videoGrid") || $("remoteVideos");

        grid?.classList.toggle(
            "mf-grid-presenting",
            Boolean(active && pinnedPresentation)
        );

        for (const [key, item] of presentationTracks) {
            item.element.hidden =
                key !== activePresentationKey;
        }

        if (label) {
            label.textContent = active
                ? `${active.name} is presenting`
                : "Screen presentation";
        }

        if (pin) {
            pin.textContent =
                pinnedPresentation ? "Unpin" : "Pin";

            pin.setAttribute(
                "aria-pressed",
                String(pinnedPresentation)
            );
        }
    }

    function showPresentation(key, track, name) {
        const { media } = ensurePresentationUI();

        if (!media || !track) return;

        const existing = presentationTracks.get(key);

        if (existing?.track === track) return;

        if (existing) {
            hidePresentation(key);
        }

        const element = track.attach();

        element.autoplay = true;
        element.playsInline = true;
        element.muted = true;

        media.appendChild(element);

        presentationTracks.set(key, {
            track,
            element,
            name
        });

        activePresentationKey = key;
        pinnedPresentation = true;

        syncPresentation();
    }

    function hidePresentation(key) {
        const item = presentationTracks.get(key);

        if (!item) return;

        try {
            item.track.detach(item.element);
        } catch (error) {
            console.warn(
                "Presentation track detach:",
                error
            );
        }

        item.element.remove();

        presentationTracks.delete(key);

        if (activePresentationKey === key) {
            activePresentationKey = null;
        }

        syncPresentation();
    }

    function clearPresentations() {
        for (const key of [
            ...presentationTracks.keys()
        ]) {
            hidePresentation(key);
        }
    }

    // =====================================================
    // SCREEN SHARING TRACK IDENTIFICATION
    // =====================================================

    function screenKey(publication, participant, track) {
        return (
            `remote:${participant.identity}:` +
            `${publication.trackSid || track?.sid || "screen"}`
        );
    }

    function syncLocalPresentation() {
        if (!room) {
            hidePresentation("local-screen");
            return;
        }

        const publication =
            room.localParticipant.getTrackPublication(
                LK.Track.Source.ScreenShare
            );

        if (publication?.track && !publication.isMuted) {
            showPresentation(
                "local-screen",
                publication.track,
                "You"
            );
        } else {
            hidePresentation("local-screen");
        }
    }

    // =====================================================
    // REMOTE CAMERA / AUDIO / SCREEN SHARING
    // =====================================================

    function attachRemoteTrack(
        track,
        publication,
        participant
    ) {
        if (
            isScreenPublication(publication) &&
            track.kind === LK.Track.Kind.Video
        ) {
            showPresentation(
                screenKey(
                    publication,
                    participant,
                    track
                ),
                track,
                participantName(participant)
            );

            return;
        }

        const entry = createRemoteTile(participant);

        const key =
            publication.trackSid || track.sid;

        if (entry.tracks.has(key)) return;

        const element = track.attach();

        element.autoplay = true;

        if (track.kind === LK.Track.Kind.Video) {
            element.playsInline = true;
            entry.content.appendChild(element);
            entry.avatar.classList.add("d-none");
        } else {
            document.body.appendChild(element);
        }

        entry.tracks.set(key, {
            track,
            element
        });

        updateRemoteAudioIndicator(participant);
    }

    function detachRemoteTrack(
        track,
        publication,
        participant
    ) {
        if (
            isScreenPublication(publication) &&
            track.kind === LK.Track.Kind.Video
        ) {
            hidePresentation(
                screenKey(
                    publication,
                    participant,
                    track
                )
            );

            return;
        }

        const entry = remoteTiles.get(
            participant.identity
        );

        if (!entry) return;

        const key =
            publication.trackSid || track.sid;

        const item = entry.tracks.get(key);

        if (item) {
            try {
                item.track.detach(item.element);
            } catch (error) {
                console.warn(
                    "Track detach:",
                    error
                );
            }

            item.element.remove();
            entry.tracks.delete(key);
        }

        const hasVideo = [
            ...entry.tracks.values()
        ].some(
            item =>
                item.element.tagName === "VIDEO"
        );

        entry.avatar.classList.toggle(
            "d-none",
            hasVideo
        );

        updateRemoteAudioIndicator(participant);
    }

    // =====================================================
    // REMOVE REMOTE PARTICIPANT
    // =====================================================

    function removeRemoteTile(participant) {
        const prefix =
            `remote:${participant.identity}:`;

        for (const key of [
            ...presentationTracks.keys()
        ]) {
            if (key.startsWith(prefix)) {
                hidePresentation(key);
            }
        }

        const entry = remoteTiles.get(
            participant.identity
        );

        if (entry) {
            for (const item of entry.tracks.values()) {
                try {
                    item.track.detach(item.element);
                } catch (error) {
                    console.warn(
                        "Participant track cleanup:",
                        error
                    );
                }

                item.element.remove();
            }

            entry.tile.remove();

            remoteTiles.delete(
                participant.identity
            );
        }

        updateParticipants();
        updateWaiting();
    }

    // =====================================================
    // CLEAR ALL REMOTE VIDEO TILES
    // =====================================================

    function clearRemoteTiles() {
        clearPresentations();

        for (const entry of remoteTiles.values()) {
            for (const item of entry.tracks.values()) {
                try {
                    item.track.detach(item.element);
                } catch (error) {
                    console.warn(
                        "Remote track cleanup:",
                        error
                    );
                }

                item.element.remove();
            }

            entry.tile.remove();
        }

        remoteTiles.clear();
    }

    // =====================================================
    // HOST REQUEST — MICROPHONE OR CAMERA
    // =====================================================

    async function sendMediaRequest(identity, media) {
        if (!currentUserIsHost || !isConnected()) {
            toast(
                "Only the connected host can send requests.",
                "warning"
            );
            return;
        }

        if (!["microphone", "camera"].includes(media)) {
            return;
        }

        const participant =
            room.remoteParticipants.get(identity);

        if (!participant) {
            toast(
                "Participant is no longer connected.",
                "warning"
            );
            return;
        }

        const requestId = crypto.randomUUID();

        const message = {
            type: "media_request",
            media,
            requestId
        };

        pendingHostRequests.set(requestId, {
            identity,
            media
        });

        try {
            await room.localParticipant.publishData(
                encoder.encode(
                    JSON.stringify(message)
                ),
                {
                    reliable: true,
                    destinationIdentities: [
                        identity
                    ],
                    topic: MEDIA_REQUEST_TOPIC
                }
            );

            toast(
                `${media === "camera" ? "Camera" : "Microphone"} ` +
                `request sent to ${participantName(participant)}.`,
                "success"
            );

        } catch (error) {
            pendingHostRequests.delete(requestId);

            console.error(
                "Media request failed:",
                error
            );

            toast(
                "Unable to send request: " +
                errorMessage(error),
                "error"
            );
        }
    }

    // =====================================================
    // HOST — RECEIVE MEDIA RESPONSE
    // =====================================================

    function handleMediaReply(payload, sender) {
        if (!currentUserIsHost || !sender) return;

        let message;

        try {
            message = JSON.parse(
                decoder.decode(payload)
            );
        } catch {
            return;
        }

        if (
            !message ||
            message.type !== "media_reply" ||
            typeof message.requestId !== "string" ||
            !["microphone", "camera"].includes(
                message.media
            ) ||
            ![
                "accepted",
                "declined",
                "failed",
                "busy"
            ].includes(message.status)
        ) {
            return;
        }

        const pending =
            pendingHostRequests.get(
                message.requestId
            );

        if (
            !pending ||
            pending.identity !== sender.identity ||
            pending.media !== message.media
        ) {
            return;
        }

        pendingHostRequests.delete(
            message.requestId
        );

        toast(
            `${participantName(sender)}: ${message.media} ` +
            `request ${message.status}.`,
            message.status === "accepted"
                ? "success"
                : "warning"
        );
    }

    // =====================================================
    // PARTICIPANT — SEND MEDIA RESPONSE
    // =====================================================

    async function sendMediaReply(
        activeRoom,
        identity,
        requestId,
        media,
        status
    ) {
        if (
            room !== activeRoom ||
            !isConnected()
        ) {
            return;
        }

        try {
            await activeRoom.localParticipant.publishData(
                encoder.encode(
                    JSON.stringify({
                        type: "media_reply",
                        requestId,
                        media,
                        status
                    })
                ),
                {
                    reliable: true,
                    destinationIdentities: [
                        identity
                    ],
                    topic: MEDIA_REPLY_TOPIC
                }
            );

        } catch (error) {
            console.warn(
                "Media response failed:",
                error
            );
        }
    }

    // =====================================================
    // CUSTOM CAMERA / MICROPHONE PERMISSION POPUP
    // =====================================================

    function closeMediaPermissionPopup() {
        activeMediaPopup?.cancel();
    }

    
    function showMediaPermissionPopup(media) {
        return new Promise((resolve, reject) => {
            if (activeMediaPopup) {
                reject(new Error(
                    "Another media permission request is active."
                ));
                return;
            }

            const modal = $("hostMediaRequestModal");
            const icon = $("mfRequestIcon");
            const title = $("mfRequestTitle");
            const message = $("mfRequestMessage");
            const declineBtn = $("mfDeclineRequest");
            const allowBtn = $("mfAllowRequest");

            if (!modal || !icon || !title || !message ||
                !declineBtn || !allowBtn) {
                reject(new Error(
                    "Media permission dialog is missing from the page."
                ));
                return;
            }

            const isCamera = media === "camera";
            icon.textContent = isCamera ? "📷" : "🎤";
            title.textContent = isCamera
                ? "Camera Permission Request"
                : "Microphone Permission Request";
            message.textContent = isCamera
                ? "The meeting host wants you to enable your camera. Do you allow this?"
                : "The meeting host wants you to enable your microphone. Do you allow this?";
            allowBtn.textContent = isCamera
                ? "Allow Camera"
                : "Allow Microphone";

            const previousFocus = document.activeElement;
            let finished = false;

            function cleanup() {
                modal.hidden = true;
                declineBtn.removeEventListener("click", decline);
                allowBtn.removeEventListener("click", allow);
                document.removeEventListener("keydown", onKeyDown);
                activeMediaPopup = null;

                if (previousFocus?.isConnected) {
                    previousFocus.focus?.();
                }
            }

            function finish(accepted, error = null) {
                if (finished) return;
                finished = true;
                cleanup();
                if (error) reject(error);
                else resolve(accepted);
            }

            function allow() {
                finish(true);
            }

            function decline() {
                finish(false);
            }

            function cancel() {
                finish(false, new Error(
                    "Media permission request cancelled."
                ));
            }

            function onKeyDown(event) {
                if (event.key === "Escape") {
                    event.preventDefault();
                    decline();
                }
            }

            activeMediaPopup = { cancel };
            declineBtn.addEventListener("click", decline);
            allowBtn.addEventListener("click", allow);
            document.addEventListener("keydown", onKeyDown);
            modal.hidden = false;
            declineBtn.focus();
        });
    }
    // =====================================================
    // PARTICIPANT — RECEIVE HOST MEDIA REQUEST
    // =====================================================

    async function handleMediaRequest(
        payload,
        sender,
        activeRoom
    ) {
        if (
            !sender ||
            room !== activeRoom ||
            !isConnected() ||
            currentUserIsHost
        ) {
            return;
        }

        // Accept requests only from the verified host.
        if (
            !verifiedHostIdentity ||
            sender.identity !== verifiedHostIdentity
        ) 
        
        {
            console.warn(
                "Rejected media request from unverified sender.",
                sender.identity,
                verifiedHostIdentity
            );
            return;
        }

        let message;

        try {
            message = JSON.parse(
                decoder.decode(payload)
            );
        } catch (error) {
            console.warn(
                "Invalid media request:",
                error
            );
            return;
        }

        if (
            !message ||
            message.type !== "media_request" ||
            !["microphone", "camera"].includes(
                message.media
            ) ||
            typeof message.requestId !== "string" ||
            !message.requestId ||
            message.requestId.length > 100 ||
            processedMediaRequests.has(
                message.requestId
            )
        ) {
            return;
        }

        processedMediaRequests.add(
            message.requestId
        );

        if (processedMediaRequests.size > 500) {
            processedMediaRequests.delete(
                processedMediaRequests
                    .values()
                    .next()
                    .value
            );
        }

        if (mediaRequestBusy) {
            await sendMediaReply(
                activeRoom,
                sender.identity,
                message.requestId,
                message.media,
                "busy"
            );
            return;
        }

        mediaRequestBusy = true;

        const media = message.media;
        let status = "failed";

        try {
            console.log(
                "Host media request received:",
                {
                    media,
                    sender: sender.identity,
                    requestId: message.requestId
                }
            );

            const accepted =
                await showMediaPermissionPopup(media);

            console.log(
                "Participant permission response:",
                accepted
            );

            if (!accepted) {
                status = "declined";

                toast(
                    `${media} request declined.`,
                    "warning"
                );

                return;
            }

            if (
                room !== activeRoom ||
                !isConnected()
            ) {
                throw new Error(
                    "Meeting disconnected."
                );
            }

            if (media === "microphone") {
                if (microphoneBusy) {
                    throw new Error(
                        "Microphone operation already running."
                    );
                }

                microphoneBusy = true;
                refreshMediaControls();

                try {
                    await activeRoom.localParticipant
                        .setMicrophoneEnabled(true);

                    updateLocalMicrophone();

                } finally {
                    microphoneBusy = false;
                }

            } else {
                if (cameraBusy) {
                    throw new Error(
                        "Camera operation already running."
                    );
                }

                cameraBusy = true;
                refreshMediaControls();

                try {
                    await activeRoom.localParticipant
                        .setCameraEnabled(true);

                    updateLocalCamera();

                } finally {
                    cameraBusy = false;
                }
            }

            const source =
                media === "microphone"
                    ? LK.Track.Source.Microphone
                    : LK.Track.Source.Camera;

            const publication =
                activeRoom.localParticipant
                    .getTrackPublication(source);

            if (
                !publication ||
                publication.isMuted
            ) {
                throw new Error(
                    `${media} was not successfully enabled.`
                );
            }

            status = "accepted";

            toast(
                `Your ${media} is now enabled.`,
                "success"
            );

        } catch (error) {
            status = "failed";

            console.error(
                "Media activation failed:",
                error
            );

            toast(
                `Could not enable ${media}: ` +
                errorMessage(error),
                "error"
            );

        } finally {
            mediaRequestBusy = false;
            refreshMediaControls();

            await sendMediaReply(
                activeRoom,
                sender.identity,
                message.requestId,
                media,
                status
            );
        }
    }

    // =====================================================
    // PARTICIPANTS LIST AND HOST ACTIONS
    // =====================================================

    function updateParticipants() {
        const list = $("participantsList");

        if (!list) return;

        list.replaceChildren();

        const participants = [{
            name: "You",
            identity: "local"
        }];

        if (room) {
            for (
                const participant of
                room.remoteParticipants.values()
            ) {
                participants.push({
                    name: participantName(participant),
                    identity: participant.identity
                });
            }
        }

        if ($("participantCount")) {
            $("participantCount").textContent =
                participants.length;
        }

        for (const participant of participants) {
            const item =
                document.createElement("div");

            item.className = "participant-item";

            const avatar =
                document.createElement("div");

            avatar.className =
                "participant-mini-avatar";

            avatar.innerHTML =
                '<i class="bi bi-person-fill"></i>';

            const name =
                document.createElement("span");

            name.textContent = participant.name;

            item.append(avatar, name);

            if (
                currentUserIsHost &&
                participant.identity !== "local"
            ) {
                const actions =
                    document.createElement("div");

                actions.className =
                    "d-flex flex-wrap gap-1 ms-auto";

                // REQUEST MICROPHONE
                const micButton =
                    document.createElement("button");

                micButton.type = "button";
                micButton.className =
                    "btn btn-sm btn-outline-primary";

                micButton.title =
                    "Request microphone";

                micButton.innerHTML =
                    '<i class="bi bi-mic"></i>';

                micButton.addEventListener(
                    "click",
                    () => {
                        void sendMediaRequest(
                            participant.identity,
                            "microphone"
                        );
                    }
                );

                // REQUEST CAMERA
                const cameraButton =
                    document.createElement("button");

                cameraButton.type = "button";
                cameraButton.className =
                    "btn btn-sm btn-outline-primary";

                cameraButton.title =
                    "Request camera";

                cameraButton.innerHTML =
                    '<i class="bi bi-camera-video"></i>';

                cameraButton.addEventListener(
                    "click",
                    () => {
                        void sendMediaRequest(
                            participant.identity,
                            "camera"
                        );
                    }
                );

                // REMOVE PARTICIPANT
                const kick =
                    document.createElement("button");

                kick.type = "button";
                kick.className =
                    "btn btn-sm btn-outline-danger";

                kick.textContent = "Remove";

                kick.addEventListener(
                    "click",
                    async () => {
                        if (!confirm(
                            `Remove ${participant.name}?`
                        )) {
                            return;
                        }

                        kick.disabled = true;

                        try {
                            await MeetFlow.request(
                                `/api/meetings/${encodedCode}/remove-participant/`,
                                {
                                    method: "POST",
                                    body: JSON.stringify({
                                        identity:
                                            participant.identity
                                    })
                                }
                            );

                            toast(
                                "Participant removed.",
                                "success"
                            );

                        } catch (error) {
                            toast(
                                errorMessage(error),
                                "error"
                            );

                            kick.disabled = false;
                        }
                    }
                );

                actions.append(
                    micButton,
                    cameraButton,
                    kick
                );

                item.appendChild(actions);
            }

            list.appendChild(item);
        }
    }


    // =====================================================
    // LOCAL CAMERA
    // =====================================================

    function updateLocalCamera() {
        if (!room) return;

        const publication =
            room.localParticipant.getTrackPublication(
                LK.Track.Source.Camera
            );

        const track = publication?.track;

        const enabled = Boolean(
            track && !publication.isMuted
        );

        const video = $("localVideo");
        const avatar = $("localAvatar");

        if (video) {
            if (enabled) {
                track.attach(video);
                video.hidden = false;
            } else {
                video.srcObject = null;
                video.hidden = true;
            }
        }

        avatar?.classList.toggle("d-none", enabled);

        setControl(
            "cameraBtn",
            enabled,
            "camera-video-fill",
            "camera-video-off-fill"
        );
    }

    // =====================================================
    // LOCAL MICROPHONE
    // =====================================================

    function updateLocalMicrophone() {
        if (!room) return;

        const publication =
            room.localParticipant.getTrackPublication(
                LK.Track.Source.Microphone
            );

        const enabled = Boolean(
            publication && !publication.isMuted
        );

        setControl(
            "micBtn",
            enabled,
            "mic-fill",
            "mic-mute-fill"
        );

        const indicator = $("localMicIndicator");

        if (indicator) {
            indicator.innerHTML = enabled
                ? '<i class="bi bi-mic-fill"></i>'
                : '<i class="bi bi-mic-mute-fill"></i>';
        }
    }

    // =====================================================
    // SCREEN SHARE STATUS
    // =====================================================

    function updateScreenShareButton() {
        if (!room) return;

        const publication =
            room.localParticipant.getTrackPublication(
                LK.Track.Source.ScreenShare
            );

        const enabled = Boolean(
            publication && !publication.isMuted
        );

        setControl(
            "screenShareBtn",
            enabled,
            "display-fill",
            "display"
        );
    }

    // =====================================================
    // TOGGLE MICROPHONE
    // =====================================================

    async function toggleMicrophone() {
        if (!requireConnection("use the microphone")) {
            return;
        }

        if (microphoneBusy) return;

        microphoneBusy = true;
        refreshMediaControls();

        try {
            const publication =
                room.localParticipant.getTrackPublication(
                    LK.Track.Source.Microphone
                );

            const enabled = Boolean(
                publication && !publication.isMuted
            );

            await room.localParticipant
                .setMicrophoneEnabled(!enabled);

            updateLocalMicrophone();

        } catch (error) {
            console.error(
                "Microphone error:",
                error
            );

            toast(
                "Microphone error: " + errorMessage(error),
                "error"
            );

        } finally {
            microphoneBusy = false;
            refreshMediaControls();
        }
    }

    // =====================================================
    // TOGGLE CAMERA
    // =====================================================

    async function toggleCamera() {
        if (!requireConnection("use the camera")) {
            return;
        }

        if (cameraBusy) return;

        cameraBusy = true;
        refreshMediaControls();

        try {
            const publication =
                room.localParticipant.getTrackPublication(
                    LK.Track.Source.Camera
                );

            const enabled = Boolean(
                publication && !publication.isMuted
            );

            await room.localParticipant
                .setCameraEnabled(!enabled);

            updateLocalCamera();

        } catch (error) {
            console.error(
                "Camera error:",
                error
            );

            toast(
                "Camera unavailable: " + errorMessage(error),
                "error"
            );

        } finally {
            cameraBusy = false;
            refreshMediaControls();
        }
    }

    // =====================================================
    // SCREEN SHARING WITH AUTO-PIN
    // =====================================================

    async function toggleScreenShare() {
        if (!requireConnection("share the screen")) {
            return;
        }

        if (screenShareBusy) return;

        screenShareBusy = true;
        refreshMediaControls();

        try {
            const publication =
                room.localParticipant.getTrackPublication(
                    LK.Track.Source.ScreenShare
                );

            const enabled = Boolean(
                publication && !publication.isMuted
            );

            await room.localParticipant
                .setScreenShareEnabled(!enabled);

            updateScreenShareButton();

            // Show or remove the local presentation.
            syncLocalPresentation();

        } catch (error) {
            console.error(
                "Screen sharing error:",
                error
            );

            toast(
                "Screen sharing error: " +
                errorMessage(error),
                "error"
            );

        } finally {
            screenShareBusy = false;
            refreshMediaControls();
        }
    }

    // =====================================================
    // MEETING CHAT
    // =====================================================

    function isChatPanelVisible() {
        const sidebar = $("meetingSidebar");
        const chatPanel = $("chatPanel");

        return Boolean(
            sidebar &&
            chatPanel &&
            !sidebar.classList.contains("d-none") &&
            !chatPanel.classList.contains("d-none")
        );
    }

    function updateUnreadChatBadge() {
        const badge = $("chatUnreadCount");
        const button = $("chatBtn");

        if (!badge || !button) return;

        if (unreadChatCount === 0) {
            badge.textContent = "";
            badge.classList.add("d-none");
            button.title = "Meeting chat";
            button.setAttribute(
                "aria-label",
                "Show meeting chat"
            );
            return;
        }

        const countLabel = unreadChatCount > 99
            ? "99+"
            : String(unreadChatCount);

        badge.textContent = countLabel;
        badge.classList.remove("d-none");
        button.title = `${unreadChatCount} unread chat message${unreadChatCount === 1 ? "" : "s"}`;
        button.setAttribute(
            "aria-label",
            `Show meeting chat, ${button.title}`
        );
    }

    function markChatRead() {
        unreadChatCount = 0;
        updateUnreadChatBadge();
    }

    function updateChatAvailability() {
        const input = $("chatInput");
        const submit = $("chatForm")?.querySelector(
            'button[type="submit"]'
        );
        const status = $("chatStatus");

        if (input) {
            input.disabled = !chatEnabled;
            input.placeholder = chatEnabled
                ? "Type a message..."
                : "Chat is disabled by the host";
        }

        if (submit) {
            submit.disabled = !chatEnabled;
            submit.title = chatEnabled
                ? "Send message"
                : "Chat is disabled by the host";
        }

        status?.classList.toggle(
            "d-none",
            chatEnabled
        );

        const button = $("chatControlBtn");
        if (button) {
            button.innerHTML = chatEnabled
                ? '<i class="bi bi-chat-slash"></i> <span class="d-none d-lg-inline">Disable chat</span>'
                : '<i class="bi bi-chat-dots"></i> <span class="d-none d-lg-inline">Enable chat</span>';
            button.title = chatEnabled
                ? "Disable chat for everyone"
                : "Enable chat for everyone";
            button.setAttribute(
                "aria-pressed",
                String(chatEnabled)
            );
            button.classList.toggle(
                "btn-outline-danger",
                chatEnabled
            );
            button.classList.toggle(
                "btn-outline-success",
                !chatEnabled
            );
        }
    }

    function setChatEnabled(enabled) {
        chatEnabled = Boolean(enabled);
        updateChatAvailability();
    }

    function setChatBubblesEnabled(enabled) {
        chatBubblesEnabled = Boolean(enabled);

        const overlay = $("chatBubbleOverlay");
        if (overlay) {
            overlay.hidden = !chatBubblesEnabled;
            if (!chatBubblesEnabled) {
                overlay.replaceChildren();
            }
        }

        const button = $("chatBubbleToggleBtn");
        if (button) {
            const label = chatBubblesEnabled
                ? "Hide chat bubbles on your screen"
                : "Show chat bubbles on your screen";
            button.innerHTML = chatBubblesEnabled
                ? '<i class="bi bi-chat-square-text-fill"></i><span>Hide messages on screen</span>'
                : '<i class="bi bi-chat-square-text"></i><span>Show messages on screen</span>';
            button.title = label;
            button.setAttribute("aria-label", label);
            button.setAttribute(
                "aria-pressed",
                String(chatBubblesEnabled)
            );
            button.classList.toggle("active", chatBubblesEnabled);
            button.classList.toggle(
                "btn-outline-info",
                !chatBubblesEnabled
            );
            button.classList.toggle(
                "btn-info",
                chatBubblesEnabled
            );
        }
    }

    async function publishChatControl(enabled, identity = null) {
        if (!currentUserIsHost || !isConnected()) {
            throw new Error(
                "Only the connected host can change chat access."
            );
        }

        const options = {
            reliable: true,
            topic: CHAT_CONTROL_TOPIC
        };

        if (identity) {
            options.destinationIdentities = [identity];
        }

        await room.localParticipant.publishData(
            encoder.encode(
                JSON.stringify({
                    type: "chat_control",
                    enabled: Boolean(enabled)
                })
            ),
            options
        );
    }

    function toggleChatBubbles() {
        setChatBubblesEnabled(!chatBubblesEnabled);
    }

    async function toggleChatAccess() {
        const button = $("chatControlBtn");
        if (!currentUserIsHost || !isConnected()) {
            toast(
                "Only the connected host can change chat access.",
                "warning"
            );
            return;
        }

        const nextEnabled = !chatEnabled;
        if (button) button.disabled = true;

        try {
            await publishChatControl(nextEnabled);
            setChatEnabled(nextEnabled);
            toast(
                nextEnabled
                    ? "Chat is enabled for everyone."
                    : "Chat is disabled for everyone.",
                "success"
            );
        } catch (error) {
            toast(
                "Could not change chat access: " +
                errorMessage(error),
                "error"
            );
        } finally {
            if (button) button.disabled = false;
        }
    }

    function handleChatControl(payload, sender, activeRoom) {
        if (
            !sender ||
            room !== activeRoom ||
            currentUserIsHost ||
            !verifiedHostIdentity ||
            sender.identity !== verifiedHostIdentity
        ) {
            return;
        }

        try {
            const message = JSON.parse(decoder.decode(payload));
            if (
                message?.type !== "chat_control" ||
                typeof message.enabled !== "boolean"
            ) {
                return;
            }

            setChatEnabled(message.enabled);
            toast(
                message.enabled
                    ? "The host enabled chat for everyone."
                    : "The host disabled chat for everyone.",
                "info"
            );
        } catch (error) {
            console.warn("Invalid chat control message:", error);
        }
    }

    function addChatMessage(
        sender,
        message,
        mine = false
    ) {
        const wrapper =
            document.createElement("div");

        wrapper.className =
            `chat-message${mine ? " mine" : ""}`;

        const name =
            document.createElement("strong");

        name.textContent = sender;

        const text =
            document.createElement("p");

        text.textContent = message.length > 300
            ? `${message.slice(0, 297)}...`
            : message;

        wrapper.append(name, text);

        const container = $("chatMessages");

        if (!container) return;

        container.appendChild(wrapper);

        container.scrollTop =
            container.scrollHeight;
    }

    function addChatBubble(sender, message) {
        if (!chatBubblesEnabled) return;

        const overlay = $("chatBubbleOverlay");
        if (!overlay) return;

        const bubble = document.createElement("div");
        bubble.className = "chat-bubble";

        const name = document.createElement("strong");
        name.textContent = sender;

        const text = document.createElement("span");
        text.textContent = message;

        bubble.append(name, text);
        overlay.appendChild(bubble);

        while (overlay.children.length > 4) {
            overlay.firstElementChild.remove();
        }

        window.setTimeout(() => bubble.remove(), 7000);
    }

    function handleDataMessage(
        payload,
        participant,
        kind,
        topic
    ) {
        try {
            if (
                topic &&
                topic !== CHAT_TOPIC
            ) {
                return;
            }

            const data = JSON.parse(
                decoder.decode(payload)
            );

            if (
                data.type !== "chat" ||
                typeof data.message !== "string"
            ) {
                return;
            }

            if (!chatEnabled) return;

            const senderName = participant
                ? participantName(participant)
                : "Participant";
            const message = data.message.slice(0, 2000);

            addChatMessage(
                senderName,
                message
            );
            addChatBubble(senderName, message);

            if (
                !isChatPanelVisible() ||
                document.visibilityState !== "visible"
            ) {
                unreadChatCount += 1;
                updateUnreadChatBadge();
            }

            const preview = message.length > 100
                ? `${message.slice(0, 97)}…`
                : message;

            toast(`${senderName}: ${preview}`, "info");

        } catch (error) {
            console.warn(
                "Invalid chat message:",
                error
            );
        }
    }

    // =====================================================
    // SEND CHAT MESSAGE
    // =====================================================

    async function sendChat(event) {
        event.preventDefault();

        if (!chatEnabled) {
            toast(
                "Chat is disabled by the host.",
                "warning"
            );
            return;
        }

        if (!requireConnection("send chat")) {
            return;
        }

        const input = $("chatInput");

        if (!input) return;

        const message = input.value.trim();

        if (!message) return;

        try {
            await MeetFlow.request(
                `/api/meetings/${encodedCode}/messages/`,
                {
                    method: "POST",
                    body: JSON.stringify({ text: message })
                }
            );

            await room.localParticipant.publishData(
                encoder.encode(
                    JSON.stringify({
                        type: "chat",
                        message
                    })
                ),
                {
                    reliable: true,
                    topic: CHAT_TOPIC
                }
            );

            addChatMessage(
                "You",
                message,
                true
            );
            addChatBubble("You", message);

            input.value = "";

        } catch (error) {
            toast(
                "Chat error: " +
                errorMessage(error),
                "error"
            );
        }
    }

    // =====================================================
    // AI CHAT SUMMARY
    // =====================================================

    async function generateAISummary() {
        if (!currentUserIsHost) {
            alert(
                "Only the host can generate summaries."
            );
            return;
        }

        if (!confirm(
            "Send up to 500 saved chat messages " +
            "to the AI provider? Spoken audio is excluded."
        )) {
            return;
        }

        const button = $("aiSummaryBtn");

        if (button) {
            button.disabled = true;
            button.textContent = "Generating...";
        }

        try {
            const response = await fetch(
                `/api/meetings/${encodedCode}/summary/`,
                {
                    method: "POST",
                    headers: {
                        Authorization:
                            `Bearer ${MeetFlow.getToken()}`,
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        consent: true
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.detail ||
                    "Summary failed."
                );
            }

            const panel = $("aiSummaryPanel");

            if (panel) {
                panel.textContent =
                    `AI summary of ${data.message_count} messages:\n\n` +
                    data.summary;

                panel.classList.remove("d-none");
            }

        } catch (error) {
            alert(errorMessage(error));

        } finally {
            if (button) {
                button.disabled = false;
                button.textContent =
                    "AI chat summary";
            }
        }
    }

    // =====================================================
    // DOWNLOAD MEETING CHAT
    // =====================================================

    async function downloadChat() {
        try {
            const response = await fetch(
                `/api/meetings/${encodedCode}/chat-export/`,
                {
                    headers: {
                        Authorization:
                            `Bearer ${MeetFlow.getToken()}`
                    }
                }
            );

            if (!response.ok) {
                throw new Error(
                    `Chat export failed (${response.status})`
                );
            }

            const blob = await response.blob();

            const url =
                URL.createObjectURL(blob);

            const link =
                document.createElement("a");

            link.href = url;
            link.download =
                `meetflow-chat-${roomCode}.txt`;

            document.body.appendChild(link);

            link.click();
            link.remove();

            setTimeout(
                () => URL.revokeObjectURL(url),
                30000
            );

        } catch (error) {
            alert(errorMessage(error));
        }
    }

    // =====================================================
    // LOCAL SCREEN RECORDING
    // =====================================================

    async function toggleLocalRecording() {
        if (screenRecorder?.state === "recording") {
            screenRecorder.stop();
            return;
        }

        if (
            !navigator.mediaDevices?.getDisplayMedia ||
            !window.MediaRecorder
        ) {
            alert("Screen recording is unsupported.");
            return;
        }

        try {
            const stream =
                await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });

            recordingStream = stream;
            recordedChunks = [];

            const mime = [
                "video/webm;codecs=vp9,opus",
                "video/webm;codecs=vp8,opus",
                "video/webm"
            ].find(type =>
                MediaRecorder.isTypeSupported(type)
            );

            const recorder = new MediaRecorder(
                stream,
                mime ? { mimeType: mime } : {}
            );

            screenRecorder = recorder;

            recorder.ondataavailable = event => {
                if (event.data.size) {
                    recordedChunks.push(event.data);
                }
            };

            recorder.onstop = () => {
                stream.getTracks().forEach(
                    track => track.stop()
                );

                const blob = new Blob(
                    recordedChunks,
                    {
                        type: recorder.mimeType ||
                            "video/webm"
                    }
                );

                if (blob.size) {
                    const url =
                        URL.createObjectURL(blob);

                    const link =
                        document.createElement("a");

                    link.href = url;

                    link.download =
                        `meetflow-screen-${roomCode}-${Date.now()}.webm`;

                    document.body.appendChild(link);
                    link.click();
                    link.remove();

                    setTimeout(
                        () => URL.revokeObjectURL(url),
                        30000
                    );
                }

                const button = $("recordScreenBtn");

                if (button) {
                    button.innerHTML =
                        '<i class="bi bi-record-circle"></i> Record screen';
                }

                if (screenRecorder === recorder) {
                    screenRecorder = null;
                }

                if (recordingStream === stream) {
                    recordingStream = null;
                }
            };

            stream.getVideoTracks()[0]
                ?.addEventListener("ended", () => {
                    if (recorder.state === "recording") {
                        recorder.stop();
                    }
                });

            recorder.start(1000);

            const button = $("recordScreenBtn");

            if (button) {
                button.innerHTML =
                    '<i class="bi bi-stop-circle-fill"></i> Stop recording';
            }

        } catch (error) {
            recordingStream?.getTracks().forEach(
                track => track.stop()
            );

            recordingStream = null;

            if (error.name !== "NotAllowedError") {
                alert(
                    "Recording error: " +
                    errorMessage(error)
                );
            }
        }
    }

    // =====================================================
    // SIDEBAR
    // =====================================================

    function showSidebar(panel) {
        const sidebar = $("meetingSidebar");

        if (!sidebar) return;

        const isOpen =
            !sidebar.classList.contains("d-none");

        const activePanel =
            !$("chatPanel")?.classList.contains("d-none")
                ? "chat"
                : "participants";

        if (isOpen && activePanel === panel) {
            sidebar.classList.add("d-none");
            return;
        }

        sidebar.classList.remove("d-none");

        const chat = panel === "chat";

        $("chatPanel")?.classList.toggle(
            "d-none",
            !chat
        );

        $("participantsPanel")?.classList.toggle(
            "d-none",
            chat
        );

        if ($("sidebarTitle")) {
            $("sidebarTitle").textContent =
                chat
                    ? "Meeting Chat"
                    : "Participants";
        }

        if (!chat) {
            updateParticipants();
        } else {
            markChatRead();
        }
    }

    function updateFullscreenButton() {
        const button = $("fullscreenBtn");
        if (!button) return;

        const isFullscreen = Boolean(
            document.fullscreenElement
        );
        const icon = button.querySelector("i");

        if (icon) {
            icon.classList.toggle(
                "bi-arrows-fullscreen",
                !isFullscreen
            );
            icon.classList.toggle(
                "bi-fullscreen-exit",
                isFullscreen
            );
        }

        button.title = isFullscreen
            ? "Exit fullscreen"
            : "Enter fullscreen";
        button.setAttribute(
            "aria-label",
            button.title
        );
        button.setAttribute(
            "aria-pressed",
            String(isFullscreen)
        );
    }

    async function toggleFullscreen() {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else if (
                document.documentElement?.requestFullscreen
            ) {
                await document.documentElement.requestFullscreen();
            } else {
                toast(
                    "Fullscreen is not supported by this browser.",
                    "warning"
                );
            }
        } catch (error) {
            console.error("Fullscreen toggle failed:", error);
            toast(
                "Could not change fullscreen mode: " +
                errorMessage(error),
                "error"
            );
        }
    }

    // =====================================================
    // MEETING TIMER
    // =====================================================

    function startTimer() {
        if (timerId) return;

        joinedAt = Date.now();

        timerId = setInterval(() => {
            const seconds = Math.floor(
                (Date.now() - joinedAt) / 1000
            );

            const hours =
                Math.floor(seconds / 3600);

            const minutes =
                Math.floor((seconds % 3600) / 60);

            const remaining = seconds % 60;

            const pad = n =>
                String(n).padStart(2, "0");

            const display = $("meetingTimer");

            if (display) {
                display.textContent = hours > 0
                    ? `${pad(hours)}:${pad(minutes)}:${pad(remaining)}`
                    : `${pad(minutes)}:${pad(remaining)}`;
            }
        }, 1000);
    }

    // =====================================================
    // CLIPBOARD
    // =====================================================

    function copyTextFallback(value) {
        const field = document.createElement("textarea");
        field.value = value;
        field.setAttribute("readonly", "");
        Object.assign(field.style, {
            position: "fixed",
            left: "-9999px",
            opacity: "0"
        });

        document.body.appendChild(field);
        field.select();
        field.setSelectionRange(0, field.value.length);

        let copied = false;

        try {
            copied = document.execCommand("copy");
        } catch (error) {
            console.warn("Clipboard fallback failed:", error);
        }

        field.remove();
        return copied;
    }

    async function copyText(value) {
        let fallbackAttempted = false;

        try {
            if (
                window.isSecureContext &&
                navigator.clipboard?.writeText
            ) {
                await navigator.clipboard.writeText(value);
            } else {
                fallbackAttempted = true;

                if (!copyTextFallback(value)) {
                    throw new Error(
                        "Clipboard access is unavailable."
                    );
                }
            }

            toast(
                "Copied to clipboard.",
                "success"
            );

        } catch (error) {
            if (
                !fallbackAttempted &&
                copyTextFallback(value)
            ) {
                toast(
                    "Copied to clipboard.",
                    "success"
                );
                return;
            }

            console.warn("Could not copy to clipboard:", error);
            toast(
                "Could not copy automatically. Please copy it manually.",
                "error"
            );
        }
    }

    // =====================================================
    // WAITING ROOM
    // =====================================================

    async function waitForAdmission(attempt) {
        const initial = await MeetFlow.request(
            MeetFlow.API.joinMeeting(roomCode),
            {
                method: "POST"
            }
        );

        if (initial.status === "approved") {
            return true;
        }

        if (initial.status === "rejected") {
            throw new Error(
                "The host declined your request."
            );
        }

        if (
            initial.status === "locked" ||
            initial.status === "ended"
        ) {
            throw new Error(
                `Meeting is ${initial.status}.`
            );
        }

        setConnection(
            "Waiting for host",
            "warning"
        );

        admissionPanel.textContent =
            "Waiting for the host to admit you...";

        return new Promise((resolve, reject) => {
            admissionPolling = setInterval(
                async () => {
                    if (
                        leaving ||
                        attempt !== joinAttempt
                    ) {
                        clearInterval(admissionPolling);
                        admissionPolling = null;

                        reject(new Error(
                            "Meeting join cancelled."
                        ));

                        return;
                    }

                    try {
                        const result =
                            await MeetFlow.request(
                                admissionUrl
                            );

                        if ([
                            "approved",
                            "rejected",
                            "locked",
                            "ended"
                        ].includes(result.status)) {
                            clearInterval(admissionPolling);
                            admissionPolling = null;

                            admissionPanel.textContent = "";

                            if (
                                result.status === "approved"
                            ) {
                                resolve(true);
                            } else {
                                reject(new Error(
                                    `Admission unavailable: ${result.status}`
                                ));
                            }
                        }

                    } catch (error) {
                        console.warn(
                            "Admission check failed:",
                            error
                        );
                    }
                },
                2500
            );
        });
    }

    // =====================================================
    // HOST ADMISSIONS
    // =====================================================

    function startHostAdmissions() {
        if (hostPolling) return;

        hostPolling = setInterval(
            async () => {
                if (leaving) return;

                try {
                    const pending =
                        await MeetFlow.request(
                            admissionsUrl
                        );

                    admissionPanel.replaceChildren();

                    for (const person of pending) {
                        const line =
                            document.createElement("div");

                        line.className =
                            "d-flex align-items-center gap-2 my-1";

                        const name =
                            document.createElement("span");

                        name.textContent =
                            `${person.name} wants to join`;

                        line.append(name);

                        for (const [label, action] of [
                            ["Admit", "approved"],
                            ["Deny", "rejected"]
                        ]) {
                            const button =
                                document.createElement(
                                    "button"
                                );

                            button.type = "button";

                            button.className =
                                action === "approved"
                                    ? "btn btn-success btn-sm"
                                    : "btn btn-outline-danger btn-sm";

                            button.textContent = label;

                            button.addEventListener(
                                "click",
                                async () => {
                                    button.disabled = true;

                                    try {
                                        await MeetFlow.request(
                                            admissionsUrl,
                                            {
                                                method: "POST",
                                                body: JSON.stringify({
                                                    id: person.id,
                                                    action
                                                })
                                            }
                                        );

                                        line.remove();

                                    } catch (error) {
                                        toast(
                                            errorMessage(error),
                                            "error"
                                        );

                                        button.disabled = false;
                                    }
                                }
                            );

                            line.append(button);
                        }

                        admissionPanel.append(line);
                    }

                } catch (error) {
                    console.warn(
                        "Host admissions error:",
                        error
                    );
                }
            },
            2500
        );
    }

    // =====================================================
    // HOST CONTROLS
    // =====================================================

    function configureHostControls(details) {
        if (!currentUserIsHost) return;

        $("aiSummaryBtn")
            ?.classList.remove("d-none");

        $("hostMeetingControls")
            ?.classList.remove("d-none");

        updateChatAvailability();
        void publishChatControl(chatEnabled).catch(error => {
            console.warn("Could not sync chat access:", error);
        });

        startHostAdmissions();

        const lockButton = $("meetingLockBtn");

        function syncLock(locked) {
            if (!lockButton) return;

            lockButton.textContent = locked
                ? "Unlock meeting"
                : "Lock meeting";

            lockButton.dataset.locked =
                String(Boolean(locked));
        }

        syncLock(details.is_locked);

        if (hostControlsBound) return;

        hostControlsBound = true;

        $("chatControlBtn")?.addEventListener(
            "click",
            () => {
                void toggleChatAccess();
            }
        );

        // LOCK / UNLOCK MEETING
        lockButton?.addEventListener(
            "click",
            async () => {
                try {
                    const locked =
                        lockButton.dataset.locked ===
                        "true";

                    const result =
                        await MeetFlow.request(
                            `/api/meetings/${encodedCode}/control/`,
                            {
                                method: "POST",
                                body: JSON.stringify({
                                    action: locked
                                        ? "unlock"
                                        : "lock"
                                })
                            }
                        );

                    syncLock(result.is_locked);

                } catch (error) {
                    toast(
                        errorMessage(error),
                        "error"
                    );
                }
            }
        );

        // END MEETING FOR EVERYONE
        $("meetingEndBtn")
            ?.addEventListener(
                "click",
                async () => {
                    if (!confirm(
                        "End this meeting for everyone?"
                    )) {
                        return;
                    }

                    try {
                        await MeetFlow.request(
                            `/api/meetings/${encodedCode}/control/`,
                            {
                                method: "POST",
                                body: JSON.stringify({
                                    action: "end"
                                })
                            }
                        );

                        await leaveMeeting();

                    } catch (error) {
                        toast(
                            errorMessage(error),
                            "error"
                        );
                    }
                }
            );
    }


    // =====================================================
    // MEETING LIFECYCLE
    // =====================================================

    function startLifecyclePolling() {
        if (lifecyclePolling) return;

        lifecyclePolling = setInterval(async () => {
            if (leaving) return;

            try {
                const state = await MeetFlow.request(
                    MeetFlow.API.meetingDetail(roomCode)
                );

                if (state.ended_at) {
                    toast(
                        "The host ended this meeting.",
                        "warning"
                    );

                    await leaveMeeting();
                }

            } catch (error) {
                console.warn(
                    "Meeting status error:",
                    error
                );
            }
        }, 3000);
    }

    // =====================================================
    // EXISTING PARTICIPANTS
    // =====================================================

    function loadExistingParticipants() {
        if (!room) return;

        for (
            const participant of
            room.remoteParticipants.values()
        ) {
            createRemoteTile(participant);

            for (
                const publication of
                participant.trackPublications.values()
            ) {
                if (publication.track) {
                    attachRemoteTrack(
                        publication.track,
                        publication,
                        participant
                    );
                }
            }

            updateRemoteAudioIndicator(participant);
        }

        updateParticipants();
        updateWaiting();
    }

    // =====================================================
    // LIVEKIT ROOM EVENTS
    // =====================================================

    
function registerRoomEvents(activeRoom) {

    // =====================================================
    // PARTICIPANT CONNECTED
    // =====================================================

    activeRoom.on(
        LK.RoomEvent.ParticipantConnected,
        participant => {
            if (room !== activeRoom) return;

            console.log(
                "Participant connected:",
                participant.identity
            );

            createRemoteTile(participant);
            updateParticipants();
            updateWaiting();

            if (currentUserIsHost) {
                void publishChatControl(
                    chatEnabled,
                    participant.identity
                ).catch(error => {
                    console.warn(
                        "Could not sync chat access with participant:",
                        error
                    );
                });
            }
        }
    );

    // =====================================================
    // PARTICIPANT DISCONNECTED
    // =====================================================

    activeRoom.on(
        LK.RoomEvent.ParticipantDisconnected,
        participant => {
            if (room !== activeRoom) return;

            console.log(
                "Participant disconnected:",
                participant.identity
            );

            removeRemoteTile(participant);
        }
    );

    // =====================================================
    // REMOTE TRACK SUBSCRIBED
    // =====================================================

    activeRoom.on(
        LK.RoomEvent.TrackSubscribed,
        (track, publication, participant) => {
            if (room !== activeRoom) return;

            attachRemoteTrack(
                track,
                publication,
                participant
            );

            console.log(
                "Remote track subscribed:",
                participant.identity,
                publication.source
            );
        }
    );

    // =====================================================
    // REMOTE TRACK UNSUBSCRIBED
    // =====================================================

    activeRoom.on(
        LK.RoomEvent.TrackUnsubscribed,
        (track, publication, participant) => {
            if (room !== activeRoom) return;

            detachRemoteTrack(
                track,
                publication,
                participant
            );
        }
    );

    // =====================================================
    // TRACK MUTED
    // =====================================================

    activeRoom.on(
        LK.RoomEvent.TrackMuted,
        (publication, participant) => {
            if (room !== activeRoom) return;

            if (isScreenPublication(publication)) {
                if (
                    participant === activeRoom.localParticipant
                ) {
                    syncLocalPresentation();

                } else if (participant) {
                    hidePresentation(
                        screenKey(
                            publication,
                            participant
                        )
                    );
                }
            }

            if (
                participant &&
                participant !== activeRoom.localParticipant
            ) {
                updateRemoteAudioIndicator(participant);

                if (
                    typeof updateRemoteCameraIndicator ===
                    "function"
                ) {
                    updateRemoteCameraIndicator(participant);
                }

            } else {
                updateLocalMicrophone();
                updateLocalCamera();
                updateScreenShareButton();
            }
        }
    );

    // =====================================================
    // TRACK UNMUTED
    // =====================================================

    activeRoom.on(
        LK.RoomEvent.TrackUnmuted,
        (publication, participant) => {
            if (room !== activeRoom) return;

            if (isScreenPublication(publication)) {
                if (
                    participant === activeRoom.localParticipant
                ) {
                    syncLocalPresentation();

                } else if (
                    participant &&
                    publication.track
                ) {
                    showPresentation(
                        screenKey(
                            publication,
                            participant
                        ),
                        publication.track,
                        participantName(participant)
                    );
                }
            }

            if (
                participant &&
                participant !== activeRoom.localParticipant
            ) {
                updateRemoteAudioIndicator(participant);

                if (
                    typeof updateRemoteCameraIndicator ===
                    "function"
                ) {
                    updateRemoteCameraIndicator(participant);
                }

            } else {
                updateLocalMicrophone();
                updateLocalCamera();
                updateScreenShareButton();
            }
        }
    );

    // =====================================================
    // DATA RECEIVED — CHAT / CAMERA / MICROPHONE
    // =====================================================

    
activeRoom.on(
    LK.RoomEvent.DataReceived,
    (payload, participant, kind, topic) => {
        if (room !== activeRoom) return;

        let messageType = null;

        try {
            messageType = JSON.parse(
                decoder.decode(payload)
            )?.type;
        } catch {
            // Non-JSON data is handled by the existing message path.
        }

        console.log("LIVEKIT MESSAGE ARRIVED", {
            topic,
            sender: participant?.identity,
            expectedHost: verifiedHostIdentity,
            connected: isConnected(),
            isHost: currentUserIsHost
        });

        if (
            topic === CHAT_CONTROL_TOPIC ||
            messageType === "chat_control"
        ) {
            handleChatControl(
                payload,
                participant,
                activeRoom
            );
            return;
        }

        if (
            topic === MEDIA_REQUEST_TOPIC ||
            messageType === "media_request"
        ) {
            console.log("CAMERA/MIC REQUEST DETECTED");

            mediaRequestQueue = mediaRequestQueue
                .then(() => handleMediaRequest(
                    payload,
                    participant,
                    activeRoom
                ))
                .catch(error => {
                console.error(
                    "Permission request error:",
                    error
                );
            });

            return;
        }

        if (
            topic === MEDIA_REPLY_TOPIC ||
            messageType === "media_reply"
        ) {
            handleMediaReply(payload, participant);
            return;
        }

        handleDataMessage(
            payload,
            participant,
            kind,
            topic
        );
    }
);


    // =====================================================
    // LOCAL TRACK PUBLISHED
    // =====================================================

    activeRoom.on(
        LK.RoomEvent.LocalTrackPublished,
        () => {
            if (room !== activeRoom) return;

            updateLocalCamera();
            updateLocalMicrophone();
            updateScreenShareButton();

            syncLocalPresentation();
        }
    );

    // =====================================================
    // LOCAL TRACK UNPUBLISHED
    // =====================================================

    activeRoom.on(
        LK.RoomEvent.LocalTrackUnpublished,
        () => {
            if (room !== activeRoom) return;

            updateLocalCamera();
            updateLocalMicrophone();
            updateScreenShareButton();

            syncLocalPresentation();
        }
    );

    // =====================================================
    // RECONNECTING
    // =====================================================

    activeRoom.on(
        LK.RoomEvent.Reconnecting,
        () => {
            if (
                room !== activeRoom ||
                leaving
            ) {
                return;
            }

            console.warn(
                "LiveKit connection interrupted."
            );

            setConnection(
                "Reconnecting...",
                "warning"
            );

            refreshMediaControls();
        }
    );

    // =====================================================
    // RECONNECTED
    // =====================================================

    activeRoom.on(
        LK.RoomEvent.Reconnected,
        async () => {
            if (
                room !== activeRoom ||
                leaving
            ) {
                return;
            }

            everConnected = true;

            console.log(
                "LiveKit connection restored."
            );

            setConnection(
                "Connected",
                "success"
            );

            hideRetryButton();

            updateLocalCamera();
            updateLocalMicrophone();
            updateScreenShareButton();

            syncLocalPresentation();

            loadExistingParticipants();

            updateParticipants();
            updateWaiting();
            refreshMediaControls();

            toast(
                "Meeting connection restored.",
                "success"
            );

            try {
                await activeRoom.startAudio();

            } catch (error) {
                console.warn(
                    "Audio playback blocked:",
                    error
                );
            }
        }
    );

    // =====================================================
    // DISCONNECTED
    // =====================================================

    activeRoom.on(
        LK.RoomEvent.Disconnected,
        reason => {
            if (room !== activeRoom) return;

            closeMediaPermissionPopup();

            console.error(
                "LiveKit disconnected:",
                reason
            );

            setConnection(
                "Disconnected",
                "danger"
            );

            refreshMediaControls();

            clearPresentations();

            if (!leaving) {
                showRetryButton();

                if (everConnected) {
                    toast(
                        "Meeting connection lost. Please reconnect.",
                        "warning"
                    );
                }
            }
        }
    );

    // =====================================================
    // MEDIA DEVICE ERRORS
    // =====================================================

    activeRoom.on(
        LK.RoomEvent.MediaDevicesError,
        error => {
            if (room !== activeRoom) return;

            console.error(
                "LiveKit media device error:",
                error
            );

            toast(
                "Camera or microphone error: " +
                errorMessage(error),
                "error"
            );
        }
    );
}

    // =====================================================
    // LIVEKIT CONNECTION TOKEN
    // =====================================================

    async function getConnectionDetails() {
        const data = await MeetFlow.request(
            MeetFlow.API.livekitToken,
            {
                method: "POST",
                body: JSON.stringify({
                    roomName: roomCode
                })
            }
        );

        const token =
            data.token ||
            data.access_token ||
            data.livekit_token;

        const url =
            data.url ||
            data.livekit_url ||
            data.server_url;

        if (!token || !url) {
            throw new Error(
                "LiveKit token or server URL missing."
            );
        }

        const parsed = new URL(url);

        if (
            !["ws:", "wss:"].includes(
                parsed.protocol
            )
        ) {
            throw new Error(
                "LiveKit URL must use ws:// or wss://."
            );
        }

        return {
            token,
            url
        };
    }

    // =====================================================
    // CONNECT TO MEETING
    // =====================================================

    async function connectMeeting() {
        if (connecting || leaving) return;

        if (!LK) {
            setConnection(
                "LiveKit unavailable",
                "danger"
            );

            toast(
                "LiveKit SDK is not loaded.",
                "error"
            );

            return;
        }

        if (isConnected()) {
            return;
        }

        connecting = true;

        const attempt = ++joinAttempt;

        hideRetryButton();

        setConnection(
            "Connecting...",
            "warning"
        );

        refreshMediaControls();

        try {
            // -----------------------------------------
            // CLEAN UP PREVIOUS CONNECTION
            // -----------------------------------------

            closeMediaPermissionPopup();
            stopPolling();
            clearRemoteTiles();

            if (room) {
                const oldRoom = room;
                room = null;

                try {
                    await oldRoom.disconnect();
                } catch (error) {
                    console.warn(
                        "Previous room cleanup:",
                        error
                    );
                }
            }

            if (
                leaving ||
                attempt !== joinAttempt
            ) {
                return;
            }

            // -----------------------------------------
            // FETCH MEETING DETAILS
            // -----------------------------------------

            const details =
                await MeetFlow.request(
                    MeetFlow.API.meetingDetail(
                        roomCode
                    )
                );

            if (details.ended_at) {
                throw new Error(
                    "This meeting has already ended."
                );
            }

            currentUserIsHost = Boolean(
                details.is_host
            );

            verifiedHostIdentity =
                typeof details.host_livekit_identity === "string"
                    ? details.host_livekit_identity.trim()
                    : typeof details.host_identity === "string"
                        ? details.host_identity.trim()
                        : null;

            // -----------------------------------------
            // WAIT FOR HOST APPROVAL
            // -----------------------------------------

            if (!currentUserIsHost) {
                await waitForAdmission(attempt);
            }

            if (
                leaving ||
                attempt !== joinAttempt
            ) {
                return;
            }

            // -----------------------------------------
            // GET LIVEKIT TOKEN
            // -----------------------------------------

            const connection =
                await getConnectionDetails();

            if (
                leaving ||
                attempt !== joinAttempt
            ) {
                return;
            }

            // -----------------------------------------
            // CREATE LIVEKIT ROOM
            // -----------------------------------------

            const activeRoom = new LK.Room({
                adaptiveStream: true,
                dynacast: true,
                disconnectOnPageLeave: true
            });

            room = activeRoom;

            registerRoomEvents(activeRoom);

            // -----------------------------------------
            // CONNECT
            // -----------------------------------------

            await activeRoom.connect(
                connection.url,
                connection.token,
                {
                    autoSubscribe: true
                }
            );

            if (
                leaving ||
                attempt !== joinAttempt
            ) {
                await activeRoom.disconnect();
                return;
            }

            everConnected = true;

            // -----------------------------------------
            // VERIFY HOST IDENTITY
            // -----------------------------------------

            console.log("MEETING HOST VERIFICATION:", {
                isHost: currentUserIsHost,
                verifiedHostIdentity
            });

            if (!currentUserIsHost && !verifiedHostIdentity) {
                console.error(
                    "Meeting details did not provide the host's " +
                    "LiveKit identity. Host media requests cannot be verified."
                );
            }

            // -----------------------------------------
            // LOAD PARTICIPANTS
            // -----------------------------------------

            loadExistingParticipants();

            // -----------------------------------------
            // INITIALIZE LOCAL MEDIA
            // -----------------------------------------

            updateLocalCamera();
            updateLocalMicrophone();
            updateScreenShareButton();
            syncLocalPresentation();

            refreshMediaControls();

            // -----------------------------------------
            // START AUDIO PLAYBACK
            // -----------------------------------------

            try {
                await activeRoom.startAudio();

            } catch (error) {
                console.warn(
                    "Audio playback requires interaction:",
                    error
                );
            }

            // -----------------------------------------
            // UPDATE CONNECTION STATUS
            // -----------------------------------------

            setConnection(
                "Connected",
                "success"
            );

            admissionPanel.textContent = "";

            hideRetryButton();

            // -----------------------------------------
            // START MEETING TIMER
            // -----------------------------------------

            startTimer();

            // -----------------------------------------
            // START LIFECYCLE MONITORING
            // -----------------------------------------

            startLifecyclePolling();

            // -----------------------------------------
            // HOST CONTROLS
            // -----------------------------------------

            if (currentUserIsHost) {
                configureHostControls(details);
            }

            updateParticipants();
            updateWaiting();

            toast(
                "Successfully joined the meeting.",
                "success"
            );

        } catch (error) {
            console.error(
                "Meeting connection failed:",
                error
            );

            setConnection(
                "Connection failed",
                "danger"
            );

            admissionPanel.textContent = "";

            toast(
                errorMessage(error),
                "error"
            );

            if (!leaving) {
                showRetryButton();
            }

        } finally {
            connecting = false;
            refreshMediaControls();

            const retry =
                $("retryMeetingConnectionBtn");

            if (retry) {
                retry.disabled = false;
            }
        }
    }

    // =====================================================
    // STOP RECORDING AND CLEAN UP MEDIA
    // =====================================================

    function cleanupRecording() {
        if (
            screenRecorder &&
            screenRecorder.state !== "inactive"
        ) {
            try {
                screenRecorder.stop();
            } catch (error) {
                console.warn(
                    "Recording stop error:",
                    error
                );
            }
        }

        if (recordingStream) {
            recordingStream
                .getTracks()
                .forEach(track => track.stop());

            recordingStream = null;
        }
    }

    // =====================================================
    // LEAVE MEETING
    // =====================================================

    async function leaveMeeting() {
        if (leaving) return;

        leaving = true;

        ++joinAttempt;

        closeMediaPermissionPopup();

        stopPolling();

        cleanupRecording();

        clearRemoteTiles();

        pendingHostRequests.clear();
        processedMediaRequests.clear();

        if (timerId) {
            clearInterval(timerId);
            timerId = null;
        }

        try {
            if (room) {
                const activeRoom = room;

                room = null;

                await activeRoom.disconnect();
            }

        } catch (error) {
            console.warn(
                "Meeting disconnect error:",
                error
            );

        } finally {
            setConnection(
                "Left meeting",
                "secondary"
            );

            window.location.href = "/dashboard/";
        }
    }

    // =====================================================
    // BIND BUTTON EVENT LISTENERS
    // =====================================================

    function bindMeetingControls() {
        setChatBubblesEnabled(chatBubblesEnabled);

        // MICROPHONE
        $("micBtn")?.addEventListener(
            "click",
            () => {
                void toggleMicrophone();
            }
        );

        // CAMERA
        $("cameraBtn")?.addEventListener(
            "click",
            () => {
                void toggleCamera();
            }
        );

        // SCREEN SHARE
        $("screenShareBtn")?.addEventListener(
            "click",
            () => {
                void toggleScreenShare();
            }
        );

        // LEAVE MEETING
        $("leaveMeetingBtn")?.addEventListener(
            "click",
            () => {
                void leaveMeeting();
            }
        );

        // CHAT FORM
        $("chatForm")?.addEventListener(
            "submit",
            event => {
                void sendChat(event);
            }
        );

        // OPEN CHAT SIDEBAR
        $("chatBtn")?.addEventListener(
            "click",
            () => {
                showSidebar("chat");
            }
        );

        $("chatBubbleToggleBtn")?.addEventListener(
            "click",
            toggleChatBubbles
        );

        // OPEN PARTICIPANTS SIDEBAR
        $("participantsBtn")?.addEventListener(
            "click",
            () => {
                showSidebar("participants");
            }
        );

        // CLOSE SIDEBAR
        $("closeSidebar")?.addEventListener(
            "click",
            () => {
                $("meetingSidebar")
                    ?.classList.add("d-none");
            }
        );

        // FULLSCREEN
        $("fullscreenBtn")?.addEventListener(
            "click",
            () => {
                void toggleFullscreen();
            }
        );
        document.addEventListener(
            "fullscreenchange",
            updateFullscreenButton
        );
        updateFullscreenButton();

        document.addEventListener(
            "visibilitychange",
            () => {
                if (
                    document.visibilityState === "visible" &&
                    isChatPanelVisible()
                ) {
                    markChatRead();
                }
            }
        );
        updateUnreadChatBadge();

        // AI SUMMARY
        $("aiSummaryBtn")?.addEventListener(
            "click",
            () => {
                void generateAISummary();
            }
        );

        // DOWNLOAD CHAT
        $("downloadChatBtn")?.addEventListener(
            "click",
            () => {
                void downloadChat();
            }
        );

        // LOCAL SCREEN RECORDING
        $("recordScreenBtn")?.addEventListener(
            "click",
            () => {
                void toggleLocalRecording();
            }
        );

        // COPY MEETING CODE
        $("copyCodeBtn")?.addEventListener(
            "click",
            () => {
                void copyText(roomCode);
            }
        );

        // COPY MEETING LINK
        $("copyMeetingLink")?.addEventListener(
            "click",
            () => {
                void copyText(
                    window.location.href
                );
            }
        );

        // REJOIN MEETING
        $("rejoinMeetingBtn")?.addEventListener(
            "click",
            () => {
                void connectMeeting();
            }
        );
    }

    // =====================================================
    // BROWSER CLEANUP
    // =====================================================

    window.addEventListener(
        "beforeunload",
        () => {
            leaving = true;

            ++joinAttempt;

            stopPolling();

            cleanupRecording();

            closeMediaPermissionPopup();

            if (room) {
                try {
                    void room.disconnect();
                } catch (error) {
                    console.warn(
                        "Unload disconnect:",
                        error
                    );
                }
            }
        }
    );

    // =====================================================
    // INITIALIZE MEETING
    // =====================================================

    function initializeMeeting() {
        bindMeetingControls();

        setConnection(
            "Preparing meeting...",
            "secondary"
        );

        refreshMediaControls();

        void connectMeeting();
    }

    initializeMeeting();

});
