
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    if (!MeetFlow.requireAuth()) return;

    const $ = id => document.getElementById(id);

    const createForm = $("createMeetingForm");
    const joinForm = $("joinMeetingForm");
    const status = $("dashboardStatus");

    const user = MeetFlow.getUser();

    if (user && $("userName")) {
        $("userName").textContent =
            user.full_name ||
            user.name ||
            user.username ||
            user.email ||
            "User";
    }

    $("logoutBtn")?.addEventListener(
        "click",
        () => MeetFlow.logout()
    );

    // =========================================
    // HELPERS
    // =========================================

    function meetingCode(meeting) {
        return (
            meeting?.code ||
            meeting?.room_code ||
            meeting?.meeting_code ||
            meeting?.id ||
            ""
        );
    }

    function meetingTitle(meeting) {
        return (
            meeting?.title ||
            meeting?.name ||
            "Untitled Meeting"
        );
    }

    function roomUrl(code) {
        return `/meeting/${encodeURIComponent(code)}/`;
    }

    function normalizeMeetings(data) {
        if (Array.isArray(data)) return data;

        if (Array.isArray(data?.results)) {
            return data.results;
        }

        if (Array.isArray(data?.meetings)) {
            return data.meetings;
        }

        return [];
    }

    function showError(message) {
        if (!status) return;

        status.className = "alert alert-danger mt-3";
        status.textContent = message;
        status.setAttribute("role", "alert");
    }

    function showSuccess(message) {
        if (!status) return;

        status.className = "alert alert-success mt-3";
        status.textContent = message;
        status.setAttribute("role", "status");
    }

    function clearStatus() {
        if (!status) return;

        status.className = "mt-3 d-none";
        status.textContent = "";
    }

    function isInvalidMeetingError(error) {
        const message = String(
            error?.message || ""
        ).toLowerCase();

        return (
            error?.status === 404 ||
            /\b404\b/.test(message) ||
            message.includes("not found") ||
            message.includes("does not exist") ||
            message.includes("invalid meeting") ||
            message.includes("meeting not found") ||
            message.includes("no meeting matches")
        );
    }

    // =========================================
    // RECENT MEETINGS TABLE
    // =========================================

    function renderMeetings(meetings) {
        const tbody = $("meetingsTableBody");
        const empty = $("meetingsEmpty");
        const table = $("meetingsTable");

        if (!tbody) return;

        tbody.replaceChildren();

        empty?.classList.toggle(
            "d-none",
            meetings.length > 0
        );

        table?.classList.toggle(
            "d-none",
            meetings.length === 0
        );

        for (const meeting of meetings) {
            const code = String(meetingCode(meeting));
            const row = document.createElement("tr");

            const titleCell = document.createElement("td");
            titleCell.textContent = meetingTitle(meeting);

            if (meeting.scheduled_for) {
                const when = document.createElement("small");
                when.className =
                    "d-block text-secondary mt-1";

                const date = new Date(meeting.scheduled_for);

                when.textContent = Number.isNaN(date.getTime())
                    ? "Invalid schedule date"
                    : `Scheduled: ${date.toLocaleString()}`;

                titleCell.appendChild(when);
            }

            const codeCell = document.createElement("td");
            codeCell.textContent = code || "—";

            const statusCell = document.createElement("td");
            const badge = document.createElement("span");

            badge.className = "badge text-bg-primary";
            badge.textContent = String(
                meeting.status || "Available"
            );

            statusCell.appendChild(badge);

            const actionCell = document.createElement("td");
            actionCell.className = "text-end";

            const join = document.createElement("a");
            join.className = "btn btn-primary btn-sm";
            join.textContent = "Open";

            if (code) {
                join.href = roomUrl(code);
            } else {
                join.classList.add("disabled");
                join.removeAttribute("href");
                join.setAttribute("aria-disabled", "true");
            }

            actionCell.appendChild(join);

            // Calendar download for scheduled meetings
            if (meeting.scheduled_for && code) {
                const calendar = document.createElement(
                    "button"
                );

                calendar.type = "button";
                calendar.className =
                    "btn btn-outline-secondary btn-sm ms-2";
                calendar.textContent = "Calendar";

                calendar.addEventListener(
                    "click",
                    async () => {
                        calendar.disabled = true;

                        try {
                            const token = MeetFlow.getToken();

                            if (!token) {
                                throw new Error(
                                    "Please log in again."
                                );
                            }

                            const response = await fetch(
                                `/api/meetings/${
                                    encodeURIComponent(code)
                                }/calendar/`,
                                {
                                    method: "GET",
                                    headers: {
                                        Authorization:
                                            `Bearer ${token}`
                                    },
                                    credentials: "same-origin"
                                }
                            );

                            if (!response.ok) {
                                throw new Error(
                                    "Unable to download calendar event."
                                );
                            }

                            const blob = await response.blob();
                            const url = URL.createObjectURL(blob);

                            const link = document.createElement("a");
                            link.href = url;
                            link.download = `meetflow-${code}.ics`;

                            document.body.appendChild(link);
                            link.click();
                            link.remove();

                            setTimeout(() => {
                                URL.revokeObjectURL(url);
                            }, 1000);

                        } catch (error) {
                            showError(error.message);
                        } finally {
                            calendar.disabled = false;
                        }
                    }
                );

                actionCell.appendChild(calendar);
            }

            row.append(
                titleCell,
                codeCell,
                statusCell,
                actionCell
            );

            tbody.appendChild(row);
        }
    }

    // =========================================
    // LOAD MEETINGS
    // =========================================

    async function loadMeetings() {
        const loading = $("meetingsLoading");
        const table = $("meetingsTable");
        const empty = $("meetingsEmpty");

        loading?.classList.remove("d-none");
        table?.classList.add("d-none");
        empty?.classList.add("d-none");

        try {
            const data = await MeetFlow.request(
                MeetFlow.API.meetings,
                { method: "GET" }
            );

            renderMeetings(normalizeMeetings(data));

        } catch (error) {
            showError(
                "Unable to load meetings: " + error.message
            );
        } finally {
            loading?.classList.add("d-none");
        }
    }

    // =========================================
    // CREATE OR SCHEDULE MEETING
    // =========================================

    createForm?.addEventListener(
        "submit",
        async event => {
            event.preventDefault();
            clearStatus();

            const titleInput = $("meetingTitle");
            const scheduleInput = $("meetingScheduled");
            const title = titleInput?.value.trim() || "";

            if (!title) {
                showError("Please enter a meeting title.");
                titleInput?.focus();
                return;
            }

            const button = $("createMeetingBtn");

            MeetFlow.setBusy(
                button,
                true,
                "Creating meeting..."
            );

            try {
                let scheduled_for = null;

                if (scheduleInput?.value) {
                    const date = new Date(scheduleInput.value);

                    if (Number.isNaN(date.getTime())) {
                        throw new Error(
                            "Please select a valid meeting date."
                        );
                    }

                    scheduled_for = date.toISOString();
                }

                const data = await MeetFlow.request(
                    MeetFlow.API.meetings,
                    {
                        method: "POST",
                        body: JSON.stringify({
                            title,
                            scheduled_for,
                            duration_minutes: Number($("meetingDuration")?.value || 60),
                            recurrence: $("meetingRecurrence")?.value || "none",
                            occurrences: Number($("meetingOccurrences")?.value || 1),
                            invitees: $("meetingInvitees")?.value || ""
                        })
                    }
                );

                const meeting = data.meeting || data;
                const code = meetingCode(meeting);

                if (!code) {
                    throw new Error(
                        "Meeting created, but the server did not return a meeting code."
                    );
                }

                if (scheduled_for) {
                    titleInput.value = "";

                    if (scheduleInput) {
                        scheduleInput.value = "";
                    }

                    showSuccess(
                        "Scheduled " + (data.created_count || 1) + " meeting(s); " + (data.invitations_sent || 0) + " invitation(s) sent. " +
                        "Share this link: " +
                        window.location.origin +
                        roomUrl(code)
                    );

                    await loadMeetings();
                    const google = document.createElement("button");
                    google.type = "button"; google.className = "btn btn-outline-primary btn-sm mt-2";
                    google.textContent = "Add to Google Calendar";
                    google.addEventListener("click", async () => {
                        try {
                            const result = await MeetFlow.request(`/api/meetings/${encodeURIComponent(code)}/google-calendar/`);
                            if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
                        } catch (error) { showError(error.message); }
                    });
                    status?.after(google);

                } else {
                    window.location.assign(roomUrl(code));
                }

            } catch (error) {
                showError(error.message);

            } finally {
                MeetFlow.setBusy(button, false);
            }
        }
    );

    // =========================================
    // JOIN MEETING - VALIDATE CODE
    // =========================================

    joinForm?.addEventListener(
        "submit",
        async event => {
            event.preventDefault();
            clearStatus();

            const codeInput = $("meetingCode");
            const code = String(
                codeInput?.value || ""
            ).trim();

            const button = $("joinMeetingBtn");

            if (!code) {
                showError(
                    "Please enter a valid meeting code."
                );
                codeInput?.focus();
                return;
            }

            MeetFlow.setBusy(
                button,
                true,
                "Checking meeting code..."
            );

            try {
                // Check code against the Django database.
                const response = await MeetFlow.request(
                    MeetFlow.API.meetingDetail(code),
                    { method: "GET" }
                );

                const meeting = response?.meeting || response;

                if (
                    !meeting ||
                    typeof meeting !== "object" ||
                    Array.isArray(meeting)
                ) {
                    showError(
                        "Please enter a valid meeting code."
                    );
                    return;
                }

                // Use a real code field when available.
                const returnedCode =
                    meeting.code ||
                    meeting.room_code ||
                    meeting.meeting_code;

                // Do not confuse a numeric database ID
                // with the public meeting code.
                if (returnedCode) {
                    if (
                        String(returnedCode).toLowerCase() !==
                        code.toLowerCase()
                    ) {
                        showError(
                            "Please enter a valid meeting code."
                        );
                        return;
                    }
                } else if (!meeting.id) {
                    showError(
                        "Please enter a valid meeting code."
                    );
                    return;
                }

                // Only redirect after successful validation.
                window.location.assign(roomUrl(code));

            } catch (error) {
                if (isInvalidMeetingError(error)) {
                    showError(
                        "Please enter a valid meeting code."
                    );
                } else {
                    showError(
                        error.message ||
                        "Unable to verify the meeting code."
                    );
                }

            } finally {
                MeetFlow.setBusy(button, false);
            }
        }
    );

    // =========================================
    // REFRESH MEETINGS
    // =========================================

    $("refreshMeetingsBtn")?.addEventListener(
        "click",
        async () => {
            clearStatus();
            await loadMeetings();
        }
    );

    // =========================================
    // INITIAL LOAD
    // =========================================

    loadMeetings();
});
