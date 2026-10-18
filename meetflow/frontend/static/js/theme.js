(() => {
    function getCurrentTheme() {
        return document.documentElement.dataset.theme || "light";
    }

    function updateButtons() {
        const dark = getCurrentTheme() === "dark";

        document.querySelectorAll(
            "[data-theme-toggle]"
        ).forEach((button) => {
            button.innerHTML = dark
                ? '<i class="bi bi-sun-fill" aria-hidden="true"></i><span class="mf-theme-label">Light mode</span>'
                : '<i class="bi bi-moon-stars-fill" aria-hidden="true"></i><span class="mf-theme-label">Dark mode</span>';

            button.setAttribute("aria-pressed", String(dark));
        });
    }

    function setTheme(theme) {
        document.documentElement.dataset.theme = theme;
        document.documentElement.dataset.bsTheme = theme;

        localStorage.setItem("meetflow-theme", theme);

        updateButtons();
    }

    document.addEventListener("click", (event) => {
        const button = event.target.closest(
            "[data-theme-toggle]"
        );

        if (!button) return;

        const nextTheme =
            getCurrentTheme() === "dark" ? "light" : "dark";

        setTheme(nextTheme);
    });

    document.addEventListener("DOMContentLoaded", updateButtons);
})();