(() => {
    const savedTheme = localStorage.getItem("meetflow-theme");

    let theme;

    if (savedTheme === "dark" || savedTheme === "light") {
        theme = savedTheme;
    } else {
        const prefersDark = window.matchMedia(
            "(prefers-color-scheme: dark)"
        ).matches;

        theme = prefersDark ? "dark" : "light";
    }

    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.bsTheme = theme;
})();