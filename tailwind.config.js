// Builds css/tailwind.css for index.html. After adding new Tailwind classes, rebuild from this folder:
//   npx tailwindcss@3.4.17 -i css/tailwind.input.css -o css/tailwind.css --minify
module.exports = {
    content: ['./index.html', './js/**/*.js'],
    // setLevel() and the breadcrumbs build these from a colour name, so the scanner can't see them
    safelist: [
        { pattern: /^(bg|border|text)-(purple|amber|emerald|indigo)-(300|400|600|950)$/ },
        { pattern: /^border-(purple|amber|emerald|indigo)-400\/30$/ },
    ],
    theme: {
        extend: {
            fontFamily: {
                // The CDN never applied the old `sans: ['Inter', ...]` override (the page always rendered in the system font),
                // so it's left out to keep the look identical. Add it back here to switch body text to Inter.
                cinzel: ['Cinzel', 'serif'],
            },
            colors: {
                dm: { 500: '#a855f7', 600: '#9333ea', 900: '#581c87', 950: '#3b0764' },
                world: { 500: '#f59e0b', 600: '#d97706', 900: '#78350f', 950: '#451a03' },
                location: { 500: '#10b981', 600: '#059669', 900: '#064e3b', 950: '#022c22' },
                vtt: { 500: '#6366f1', 600: '#4f46e5', 900: '#312e81', 950: '#1e1b4b' }
            }
        }
    }
};
