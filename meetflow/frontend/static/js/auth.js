
"use strict";

document.addEventListener("DOMContentLoaded", () => {

    const loginForm = document.getElementById(
        "loginForm"
    );

    const signupForm = document.getElementById(
        "signupForm"
    );

    const verifyForm = document.getElementById(
        "verifyEmailForm"
    );

    const forgotForm = document.getElementById(
        "forgotPasswordForm"
    );

    const resetForm = document.getElementById(
        "resetPasswordForm"
    );

    function getValue(form, name) {
        return String(
            new FormData(form).get(name) || ""
        ).trim();
    }

    function validEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function validOTP(otp) {
        return /^\d{6}$/.test(otp);
    }

    function showStatus(
        form,
        message,
        type = "error"
    ) {
        const status = form.querySelector(
            ".form-status"
        );

        MeetFlow.setStatus(
            status,
            message,
            type
        );
    }

    function redirect(url, delay = 1100) {
        setTimeout(() => {
            window.location.assign(url);
        }, delay);
    }

    async function submitRequest(
        form,
        url,
        payload,
        loadingText
    ) {
        const button = form.querySelector(
            'button[type="submit"]'
        );

        MeetFlow.setBusy(
            button,
            true,
            loadingText
        );

        try {
            return await MeetFlow.request(url, {
                method: "POST",
                body: JSON.stringify(payload)
            });
        } finally {
            MeetFlow.setBusy(button, false);
        }
    }

    // ==========================================
    // LOGIN
    // ==========================================

    if (loginForm) {
        loginForm.addEventListener(
            "submit",
            async event => {
                event.preventDefault();

                const email = getValue(
                    loginForm,
                    "email"
                );

                const password = getValue(
                    loginForm,
                    "password"
                );

                showStatus(loginForm, "");

                if (!validEmail(email) || !password) {
                    showStatus(
                        loginForm,
                        "Enter a valid email and password."
                    );
                    return;
                }

                try {
                    const data = await submitRequest(
                        loginForm,
                        MeetFlow.API.login,
                        {
                            email,
                            password
                        },
                        "Logging in..."
                    );

                    MeetFlow.saveSession(data);

                    showStatus(
                        loginForm,
                        "Login successful! Redirecting...",
                        "success"
                    );

                    redirect("/dashboard/", 500);

                } catch (error) {
                    showStatus(
                        loginForm,
                        error.message
                    );
                }
            }
        );
    }

    // ==========================================
    // SIGNUP - SEND OTP
    // ==========================================

    if (signupForm) {
        signupForm.addEventListener(
            "submit",
            async event => {
                event.preventDefault();

                const fullName = getValue(
                    signupForm,
                    "full_name"
                );

                const email = getValue(
                    signupForm,
                    "email"
                );

                // Preserve password whitespace.
                const password = String(
                    new FormData(signupForm).get(
                        "password"
                    ) || ""
                );

                showStatus(signupForm, "");

                if (
                    !fullName ||
                    !validEmail(email) ||
                    !password
                ) {
                    showStatus(
                        signupForm,
                        "Please complete all signup fields."
                    );
                    return;
                }

                try {
                    await submitRequest(
                        signupForm,
                        MeetFlow.API.signup,
                        {
                            full_name: fullName,
                            email,
                            password
                        },
                        "Sending OTP..."
                    );

                    sessionStorage.setItem(
                        "pending_signup_email",
                        email
                    );

                    showStatus(
                        signupForm,
                        "OTP requested successfully. Redirecting...",
                        "success"
                    );

                    redirect("/verify-email/", 700);

                } catch (error) {
                    showStatus(
                        signupForm,
                        error.message
                    );
                }
            }
        );
    }

    // ==========================================
    // VERIFY EMAIL OTP
    // ==========================================

    if (verifyForm) {
        const emailInput = verifyForm.querySelector(
            '[name="email"]'
        );

        const otpInput = verifyForm.querySelector(
            '[name="otp"]'
        );

        const savedEmail = sessionStorage.getItem(
            "pending_signup_email"
        );

        if (emailInput && savedEmail) {
            emailInput.value = savedEmail;
        }

        if (otpInput) {
            otpInput.addEventListener(
                "input",
                () => {
                    otpInput.value =
                        otpInput.value
                            .replace(/\D/g, "")
                            .slice(0, 6);
                }
            );
        }

        verifyForm.addEventListener(
            "submit",
            async event => {
                event.preventDefault();

                const email = getValue(
                    verifyForm,
                    "email"
                );

                const otp = getValue(
                    verifyForm,
                    "otp"
                );

                showStatus(verifyForm, "");

                if (!validEmail(email)) {
                    showStatus(
                        verifyForm,
                        "Enter a valid email address."
                    );
                    return;
                }

                if (!validOTP(otp)) {
                    showStatus(
                        verifyForm,
                        "Enter a valid 6-digit OTP."
                    );
                    return;
                }

                try {
                    await submitRequest(
                        verifyForm,
                        MeetFlow.API.verifySignup,
                        {
                            email,
                            otp
                        },
                        "Verifying OTP..."
                    );

                    sessionStorage.removeItem(
                        "pending_signup_email"
                    );

                    showStatus(
                        verifyForm,
                        "Email verified successfully! Redirecting to login...",
                        "success"
                    );

                    // Redirect only after backend success.
                    redirect("/login/", 1100);

                } catch (error) {
                    showStatus(
                        verifyForm,
                        error.message ||
                        "OTP verification failed."
                    );
                }
            }
        );
    }

    // ==========================================
    // FORGOT PASSWORD - SEND OTP
    // ==========================================

    if (forgotForm) {
        forgotForm.addEventListener(
            "submit",
            async event => {
                event.preventDefault();

                const email = getValue(
                    forgotForm,
                    "email"
                );

                showStatus(forgotForm, "");

                if (!validEmail(email)) {
                    showStatus(
                        forgotForm,
                        "Enter a valid email address."
                    );
                    return;
                }

                try {
                    await submitRequest(
                        forgotForm,
                        MeetFlow.API.forgotPassword,
                        { email },
                        "Sending OTP..."
                    );

                    sessionStorage.setItem(
                        "reset_email",
                        email
                    );

                    showStatus(
                        forgotForm,
                        "Password reset request submitted. Redirecting...",
                        "success"
                    );

                    redirect("/reset-password/", 800);

                } catch (error) {
                    showStatus(
                        forgotForm,
                        error.message
                    );
                }
            }
        );
    }

    // ==========================================
    // RESET PASSWORD USING OTP
    // ==========================================

    if (resetForm) {
        const emailInput = resetForm.querySelector(
            '[name="email"]'
        );

        const savedEmail = sessionStorage.getItem(
            "reset_email"
        );

        if (emailInput && savedEmail) {
            emailInput.value = savedEmail;
        }

        const otpInput = resetForm.querySelector(
            '[name="otp"]'
        );

        if (otpInput) {
            otpInput.addEventListener(
                "input",
                () => {
                    otpInput.value =
                        otpInput.value
                            .replace(/\D/g, "")
                            .slice(0, 6);
                }
            );
        }

        resetForm.addEventListener(
            "submit",
            async event => {
                event.preventDefault();

                const formData = new FormData(
                    resetForm
                );

                const email = getValue(
                    resetForm,
                    "email"
                );

                const otp = getValue(
                    resetForm,
                    "otp"
                );

                const newPassword = String(
                    formData.get("new_password") || ""
                );

                const confirmPassword = String(
                    formData.get("confirm_password") || ""
                );

                showStatus(resetForm, "");

                if (!validEmail(email)) {
                    showStatus(
                        resetForm,
                        "Enter a valid email address."
                    );
                    return;
                }

                if (!validOTP(otp)) {
                    showStatus(
                        resetForm,
                        "Enter a valid 6-digit OTP."
                    );
                    return;
                }

                if (!newPassword) {
                    showStatus(
                        resetForm,
                        "Enter your new password."
                    );
                    return;
                }

                if (
                    newPassword !== confirmPassword
                ) {
                    showStatus(
                        resetForm,
                        "Passwords do not match."
                    );
                    return;
                }

                try {
                    await submitRequest(
                        resetForm,
                        MeetFlow.API.resetPassword,
                        {
                            email,
                            otp,
                            password: newPassword
                        },
                        "Resetting password..."
                    );

                    sessionStorage.removeItem(
                        "reset_email"
                    );

                    showStatus(
                        resetForm,
                        "Password reset successfully! Redirecting to login...",
                        "success"
                    );

                    redirect("/login/", 1100);

                } catch (error) {
                    showStatus(
                        resetForm,
                        error.message
                    );
                }
            }
        );
    }
});
