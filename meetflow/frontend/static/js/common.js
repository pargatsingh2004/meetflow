
"use strict";

const MeetFlow = (() => {
    const API = {
        login: "/api/auth/login/",
        signup: "/api/auth/register/",
        verifySignup: "/api/auth/verify-signup/",
        forgotPassword: "/api/auth/forgot-password/",
        resetPassword: "/api/auth/reset-password/",
        profile: "/api/auth/me/",
        refresh: "/api/auth/refresh/",

        meetings: "/api/meetings/",
        joinMeeting: code =>
            `/api/meetings/${encodeURIComponent(code)}/join/`,

        livekitToken: "/api/token/",
        meetingDetail: code =>
            `/api/meetings/${encodeURIComponent(code)}/`
    };

    const TOKEN_KEY = "meetflow_access";
    const REFRESH_KEY = "meetflow_refresh";
    const USER_KEY = "meetflow_user";

    function saveSession(data) {
        const access = data?.access || data?.access_token;
        const refresh = data?.refresh || data?.refresh_token;

        if (!access) {
            throw new Error(
                "Login succeeded, but the server did not return an access token."
            );
        }

        sessionStorage.setItem(TOKEN_KEY, access);

        if (refresh) {
            sessionStorage.setItem(REFRESH_KEY, refresh);
        } else {
            sessionStorage.removeItem(REFRESH_KEY);
        }

        if (data.user) {
            sessionStorage.setItem(
                USER_KEY,
                JSON.stringify(data.user)
            );
        } else {
            sessionStorage.removeItem(USER_KEY);
        }
    }

    function getToken() {
        return sessionStorage.getItem(TOKEN_KEY);
    }

    function getUser() {
        try {
            return JSON.parse(
                sessionStorage.getItem(USER_KEY) || "null"
            );
        } catch {
            return null;
        }
    }

    function clearSession() {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(REFRESH_KEY);
        sessionStorage.removeItem(USER_KEY);
    }

    function logout() {
        clearSession();
        window.location.assign("/login/");
    }

    function requireAuth() {
        if (!getToken()) {
            window.location.replace("/login/");
            return false;
        }
        return true;
    }

    function readCookie(name) {
        const prefix = `${name}=`;

        const item = document.cookie
            .split("; ")
            .find(row => row.startsWith(prefix));

        return item
            ? decodeURIComponent(item.slice(prefix.length))
            : "";
    }

    async function parseResponse(response) {
        if (response.status === 204) {
            return {};
        }

        const contentType =
            response.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
            try {
                return await response.json();
            } catch {
                throw new Error(
                    "The server returned invalid JSON."
                );
            }
        }

        const text = await response.text();

        return text
            ? { detail: text.slice(0, 300) }
            : {};
    }

    function errorMessage(
        data,
        fallback = "Request failed."
    ) {
        if (typeof data === "string") {
            return data;
        }

        if (!data || typeof data !== "object") {
            return fallback;
        }

        for (const key of [
            "detail",
            "message",
            "error",
            "non_field_errors"
        ]) {
            if (data[key]) {
                const value = data[key];

                return Array.isArray(value)
                    ? value.join(", ")
                    : String(value);
            }
        }

        const first = Object.entries(data)[0];

        if (first) {
            const [field, value] = first;

            return `${field}: ${
                Array.isArray(value)
                    ? value.join(", ")
                    : String(value)
            }`;
        }

        return fallback;
    }

    async function refreshAccessToken() {
        const refresh = sessionStorage.getItem(
            REFRESH_KEY
        );

        if (!refresh) {
            return false;
        }

        let response;

        try {
            response = await fetch(API.refresh, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": readCookie("csrftoken")
                },
                body: JSON.stringify({ refresh })
            });
        } catch {
            return false;
        }

        if (!response.ok) {
            return false;
        }

        let data;

        try {
            data = await response.json();
        } catch {
            return false;
        }

        const access =
            data.access || data.access_token;

        if (!access) {
            return false;
        }

        sessionStorage.setItem(TOKEN_KEY, access);

        const newRefresh =
            data.refresh || data.refresh_token;

        if (newRefresh) {
            sessionStorage.setItem(
                REFRESH_KEY,
                newRefresh
            );
        }

        return true;
    }

    async function request(
        url,
        options = {},
        retry = true
    ) {
        const headers = new Headers(
            options.headers || {}
        );

        if (
            !headers.has("Content-Type") &&
            options.body !== undefined &&
            !(options.body instanceof FormData)
        ) {
            headers.set(
                "Content-Type",
                "application/json"
            );
        }

        const access = getToken();

        if (access) {
            headers.set(
                "Authorization",
                `Bearer ${access}`
            );
        }

        const csrf = readCookie("csrftoken");

        if (csrf) {
            headers.set("X-CSRFToken", csrf);
        }

        let response;

        try {
            response = await fetch(url, {
                ...options,
                headers,
                credentials: "same-origin"
            });
        } catch {
            throw new Error(
                "Cannot connect to the Django server. Check that it is running."
            );
        }

        if (
            response.status === 401 &&
            retry &&
            sessionStorage.getItem(REFRESH_KEY) &&
            url !== API.refresh
        ) {
            const refreshed =
                await refreshAccessToken();

            if (refreshed) {
                return request(url, options, false);
            }
        }

        const data = await parseResponse(response);

        if (!response.ok) {
            throw new Error(
                errorMessage(
                    data,
                    `HTTP ${response.status}`
                )
            );
        }

        return data;
    }

    function showToast(
        message,
        type = "info"
    ) {
        const area = document.getElementById(
            "toastArea"
        );

        if (!area) {
            console.log(message);
            return;
        }

        const colors = {
            success: "success",
            error: "danger",
            warning: "warning",
            info: "primary"
        };

        const alert = document.createElement("div");

        alert.className =
            `alert alert-${colors[type] || "primary"} ` +
            "shadow-sm alert-dismissible fade show";

        const text = document.createElement("span");
        text.textContent = String(message);

        const close = document.createElement("button");
        close.type = "button";
        close.className = "btn-close";
        close.setAttribute(
            "aria-label",
            "Close"
        );

        let dismissalTimer = null;

        function dismissAlert() {
            clearTimeout(dismissalTimer);
            alert.remove();
        }

        close.addEventListener("click", dismissAlert);

        alert.append(text, close);
        area.appendChild(alert);

        dismissalTimer = window.setTimeout(
            () => alert.remove(),
            5000
        );
    }

    function setStatus(
        element,
        message,
        type = "info"
    ) {
        if (!element) {
            return;
        }

        if (!message) {
            element.className = "form-status";
            element.textContent = "";
            return;
        }

        const colors = {
            success: "success",
            error: "danger",
            warning: "warning",
            info: "primary"
        };

        element.className =
            `form-status alert alert-${
                colors[type] || "primary"
            }`;

        element.textContent = String(message);
    }

    function setBusy(
        button,
        busy,
        label = "Please wait..."
    ) {
        if (!button) {
            return;
        }

        if (busy) {
            if (
                button.dataset.originalText === undefined
            ) {
                button.dataset.originalText =
                    button.innerHTML;
            }

            button.disabled = true;
            button.textContent = label;

        } else {
            button.disabled = false;

            if (
                button.dataset.originalText !== undefined
            ) {
                button.innerHTML =
                    button.dataset.originalText;

                delete button.dataset.originalText;
            }
        }
    }

    return {
        API,
        request,
        saveSession,
        getToken,
        getUser,
        clearSession,
        logout,
        requireAuth,
        showToast,
        setStatus,
        setBusy
    };
})();
