
"use strict";

document.addEventListener("DOMContentLoaded", () => {

    // PASSWORD VISIBILITY
    document.querySelectorAll("[data-password-toggle]")
        .forEach(button => {

            button.addEventListener("click", () => {
                const inputId = button.dataset.passwordToggle;
                const input = document.getElementById(inputId);

                if (!input) return;

                const show = input.type === "password";

                input.type = show ? "text" : "password";

                button.innerHTML = show
                    ? '<i class="bi bi-eye-slash"></i>'
                    : '<i class="bi bi-eye"></i>';

                button.setAttribute(
                    "aria-label",
                    show ? "Hide password" : "Show password"
                );

                button.setAttribute(
                    "aria-pressed",
                    String(show)
                );
            });

        });

    // PASSWORD STRENGTH INDICATOR
    const passwordInput = document.getElementById(
        "signupPassword"
    );

    const strengthBar = document.getElementById(
        "passwordStrengthBar"
    );

    const strengthText = document.getElementById(
        "passwordStrengthText"
    );

    if (!passwordInput || !strengthBar || !strengthText) {
        return;
    }

    function getStrength(password) {
        if (!password) return 0;

        let score = 0;

        if (password.length >= 8) score++;
        if (password.length >= 12) score++;
        if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
        if (/\d/.test(password)) score++;
        if (/[^a-zA-Z0-9]/.test(password)) score++;

        return score;
    }

    passwordInput.addEventListener("input", () => {
        const password = passwordInput.value;
        const score = getStrength(password);

        const levels = [
            { width: "0%", color: "#e5e7eb", label: "Use at least 8 characters." },
            { width: "20%", color: "#ef4444", label: "Very weak password" },
            { width: "40%", color: "#f97316", label: "Weak password" },
            { width: "60%", color: "#eab308", label: "Moderate password" },
            { width: "80%", color: "#22c55e", label: "Strong password" },
            { width: "100%", color: "#16a34a", label: "Very strong password" }
        ];

        const level = levels[score];

        strengthBar.style.width = level.width;
        strengthBar.style.backgroundColor = level.color;
        strengthText.textContent = level.label;
    });

});
