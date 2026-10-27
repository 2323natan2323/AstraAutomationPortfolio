/* Media configuration — the only file to edit when the real assets are ready.
   Leave a value empty to keep the labelled placeholder.

   Real ASTRA recording (replaces the placeholder stage on the home page):
     1. Copy the approved recording into /media (for example media/astra-run.mp4).
     2. Fill in `video.src` (and optionally `webm`, `poster`, `captions`).
   Portrait (replaces the portrait placeholder): put the file in /media and set `portrait`. */
window.ASTRA_MEDIA = {
  video: {
    src: "",      // e.g. "media/astra-run.mp4"
    webm: "",     // optional, e.g. "media/astra-run.webm"
    poster: "",   // e.g. "media/astra-poster.jpg"
    captions: { he: "", en: "" } // optional WebVTT files
  },
  vimeo: "1239839337", // public Vimeo id of the real ASTRA run; loads only after a click
  github: "",     // Only a VERIFIED, publicly accessible and approved ASTRA repository URL. Empty keeps the button hidden.
  portrait: "img/natan-home.jpg"
};
