const sources = {
  video: {
    type: 'video',
    title: 'View From A Blue Moon',
    sources: [
      {
        src: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-576p.mp4',
        type: 'video/mp4',
        size: 576,
      },
      {
        src: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-720p.mp4',
        type: 'video/mp4',
        size: 720,
      },
      {
        src: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-1080p.mp4',
        type: 'video/mp4',
        size: 1080,
      },
      {
        src: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-1440p.mp4',
        type: 'video/mp4',
        size: 1440,
      },
    ],
    poster: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-HD.jpg',
    tracks: [
      {
        kind: 'captions',
        label: 'English',
        srclang: 'en',
        src: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-HD.en.vtt',
        default: true,
      },
      {
        kind: 'captions',
        label: 'French',
        srclang: 'fr',
        src: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-HD.fr.vtt',
      },
      {
        kind: 'descriptions',
        label: 'English',
        srclang: 'en',
        src: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-HD.en.vtt',
        default: true,
      },
      {
        kind: 'descriptions',
        label: 'French',
        srclang: 'fr',
        src: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-HD.fr.vtt',
      },
    ],
    previewThumbnails: {
      src: ['https://cdn.plyr.io/static/demo/thumbs/100p.vtt', 'https://cdn.plyr.io/static/demo/thumbs/240p.vtt'],
    },
  },
  audio: {
    type: 'audio',
    title: 'Kishi Bashi &ndash; &ldquo;It All Began With A Burst&rdquo;',
    sources: [
      {
        src: 'https://cdn.plyr.io/static/demo/Kishi_Bashi_-_It_All_Began_With_a_Burst.mp3',
        type: 'audio/mp3',
      },
      {
        src: 'https://cdn.plyr.io/static/demo/Kishi_Bashi_-_It_All_Began_With_a_Burst.ogg',
        type: 'audio/ogg',
      },
    ],
  },
  youtube: {
    type: 'video',
    sources: [
      {
        src: 'https://youtube.com/watch?v=bTqVqk7FSmY',
        provider: 'youtube',
      },
    ],
  },
  vimeo: {
    type: 'video',
    sources: [
      {
        src: 'https://vimeo.com/40648169',
        provider: 'vimeo',
      },
    ],
  },
};
document.addEventListener('DOMContentLoaded', function () {
  const playerOptions = {
    debug: true,
    title: 'View From A Blue Moon',
    hideControls: false,
    iconUrl: 'dist/demo.svg',
    keyboard: {
      global: true,
    },
    tooltips: {
      controls: true,
    },
    captions: {
      active: true,
    },
    descriptions: {
      active: true,
    },
    previewThumbnails: {
      enabled: true,
      src: ['https://cdn.plyr.io/static/demo/thumbs/100p.vtt', 'https://cdn.plyr.io/static/demo/thumbs/240p.vtt'],
    },
    vimeo: {
      // Prevent Vimeo blocking plyr.io demo site
      referrerPolicy: 'no-referrer',
    },
  };

  // Setup the player
  const videoPlayer = new Plyr('#video-player', playerOptions);
  const audioPlayer = new Plyr('#audio-player', playerOptions);
  const youtubePlayer = new Plyr('#youtube-player', playerOptions);
  const vimeoPlayer = new Plyr('#vimeo-player', playerOptions);

  // Expose for tinkering in the console
  window.videoPlayer = videoPlayer;
  window.audioPlayer = audioPlayer;
  window.youtubePlayer = youtubePlayer;
  window.vimeoPlayer = vimeoPlayer;

  // Set the source
  videoPlayer.source = sources.video;
  audioPlayer.source = sources.audio;
});
