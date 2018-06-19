// ==========================================================================
// Plyr
// plyr.js v3.3.16
// https://github.com/sampotts/plyr
// License: The MIT License (MIT)
// ==========================================================================

import captions from './captions';
import defaults from './config/defaults';
import { getProviderByUrl, providers, types } from './config/types';
import Console from './console';
import controls from './controls';
import Fullscreen from './fullscreen';
import Listeners from './listeners';
import media from './media';
import Ads from './plugins/ads';
import source from './source';
import Storage from './storage';
import support from './support';
import ui from './ui';
import logo from './logo';
import hahow from './hahowCustomControl';
import { closest } from './utils/arrays';
import { setAttributes, createElement, hasClass, removeElement, replaceElement, toggleClass, wrap } from './utils/elements';
import { off, on, once, triggerEvent, unbindListeners } from './utils/events';
import is from './utils/is';
import loadSprite from './utils/loadSprite';
import { cloneDeep, extend } from './utils/objects';
import { parseUrl } from './utils/urls';

// Private properties
// TODO: Use a WeakMap for private globals
// const globals = new WeakMap();

// Plyr instance
class Plyr {
    constructor(target, options) {
        this.timers = {};

        // State
        this.ready = false;
        this.loading = false;
        this.failed = false;

        // Touch device
        this.touch = support.touch;

        // Set the media element
        this.media = target;

        // String selector passed
        if (is.string(this.media)) {
            this.media = document.querySelectorAll(this.media);
        }

        // jQuery, NodeList or Array passed, use first element
        if ((window.jQuery && this.media instanceof jQuery) || is.nodeList(this.media) || is.array(this.media)) {
            // eslint-disable-next-line
            this.media = this.media[0];
        }

        // Set config
        this.config = extend(
            {},
            defaults,
            Plyr.defaults,
            options || {},
            (() => {
                try {
                    return JSON.parse(this.media.getAttribute('data-plyr-config'));
                } catch (e) {
                    return {};
                }
            })(),
        );

        // Elements cache
        this.elements = {
            container: null,
            buttons: {},
            display: {},
            progress: {},
            inputs: {},
            settings: {
                menu: null,
                panes: {},
                tabs: {},
            },
            captions: null,
        };

        // Captions
        this.captions = {
            active: null,
            currentTrack: -1,
            meta: new WeakMap(),
        };

        // Fullscreen
        this.fullscreen = {
            active: false,
        };

        // Options
        this.options = {
            speed: [],
            quality: [],
        };

        // Debugging
        // TODO: move to globals
        this.debug = new Console(this.config.debug);

        // Log config options and support
        this.debug.log('Config', this.config);
        this.debug.log('Support', support);

        // We need an element to setup
        if (is.nullOrUndefined(this.media) || !is.element(this.media)) {
            this.debug.error('Setup failed: no suitable element passed');
            return;
        }

        // Bail if the element is initialized
        if (this.media.plyr) {
            this.debug.warn('Target already setup');
            return;
        }

        // Bail if not enabled
        if (!this.config.enabled) {
            this.debug.error('Setup failed: disabled by config');
            return;
        }

        // Bail if disabled or no basic support
        // You may want to disable certain UAs etc
        if (!support.check().api) {
            this.debug.error('Setup failed: no support');
            return;
        }

        // Cache original element state for .destroy()
        const clone = this.media.cloneNode(true);
        clone.autoplay = false;
        this.elements.original = clone;

        // Set media type based on tag or data attribute
        // Supported: video, audio, vimeo, youtube
        const type = this.media.tagName.toLowerCase();

        // Embed properties
        let iframe = null;
        let url = null;

        // Different setup based on type
        switch (type) {
            case 'div':
                // Find the frame
                iframe = this.media.querySelector('iframe');

                // <iframe> type
                if (is.element(iframe)) {
                    // Detect provider
                    url = parseUrl(iframe.getAttribute('src'));
                    this.provider = getProviderByUrl(url.toString());

                    // Rework elements
                    this.elements.container = this.media;
                    this.media = iframe;

                    // Reset classname
                    this.elements.container.className = '';

                    // Get attributes from URL and set config
                    if (url.searchParams.length) {
                        const truthy = ['1', 'true'];

                        if (truthy.includes(url.searchParams.get('autoplay'))) {
                            this.config.autoplay = true;
                        }
                        if (truthy.includes(url.searchParams.get('loop'))) {
                            this.config.loop.active = true;
                        }

                        // TODO: replace fullscreen.iosNative with this playsinline config option
                        // YouTube requires the playsinline in the URL
                        if (this.isYouTube) {
                            this.config.playsinline = truthy.includes(url.searchParams.get('playsinline'));
                        } else {
                            this.config.playsinline = true;
                        }
                    }
                } else {
                    // <div> with attributes
                    this.provider = this.media.getAttribute(this.config.attributes.embed.provider);

                    // Remove attribute
                    this.media.removeAttribute(this.config.attributes.embed.provider);
                }

                // Unsupported or missing provider
                if (is.empty(this.provider) || !Object.keys(providers).includes(this.provider)) {
                    this.debug.error('Setup failed: Invalid provider');
                    return;
                }

                // Audio will come later for external providers
                this.type = types.video;

                break;

            case 'video':
            case 'audio':
                this.type = type;
                this.provider = providers.html5;

                // Get config from attributes
                if (this.media.hasAttribute('crossorigin')) {
                    this.config.crossorigin = true;
                }
                if (this.media.hasAttribute('autoplay')) {
                    this.config.autoplay = true;
                }
                if (this.media.hasAttribute('playsinline')) {
                    this.config.playsinline = true;
                }
                if (this.media.hasAttribute('muted')) {
                    this.config.muted = true;
                }
                if (this.media.hasAttribute('loop')) {
                    this.config.loop.active = true;
                }

                break;

            default:
                this.debug.error('Setup failed: unsupported type');
                return;
        }

        // Check for support again but with type
        this.supported = support.check(this.type, this.provider, this.config.playsinline);

        // If no support for even API, bail
        if (!this.supported.api) {
            this.debug.error('Setup failed: no support');
            return;
        }

        this.eventListeners = [];

        // Create listeners
        this.listeners = new Listeners(this);

        // Setup local storage for user settings
        this.storage = new Storage(this);

        // Store reference
        this.media.plyr = this;

        // Wrap media
        if (!is.element(this.elements.container)) {
            this.elements.container = createElement('div');
            wrap(this.media, this.elements.container);
        }

        // Add style hook
        ui.addStyleHook.call(this);
        ui.addStylehookToFullscreenContainer.call(this);

        // Setup media
        media.setup.call(this);

        // Listen for events if debugging
        if (this.config.debug) {
            on.call(this, this.elements.container, this.config.events.join(' '), event => {
                this.debug.log(`event: ${event.type}`);
            });
        }

        // Setup interface
        // If embed but not fully supported, build interface now to avoid flash of controls
        if (this.isHTML5 || (this.isEmbed && !this.supported.ui)) {
            ui.build.call(this);
        }

        logo.setup.call(this);

        // Container listeners
        this.listeners.container();

        // Global listeners
        this.listeners.global();

        // Setup fullscreen
        this.fullscreen = new Fullscreen(this);

        // Setup ads if provided
        this.ads = new Ads(this);

        // Autoplay if required
        if (this.config.autoplay) {
            this.play();
        }
    }

    // ---------------------------------------
    // API
    // ---------------------------------------

    /**
     * Types and provider helpers
     */
    get isHTML5() {
        return Boolean(this.provider === providers.html5);
    }
    get isEmbed() {
        return Boolean(this.isYouTube || this.isVimeo);
    }
    get isYouTube() {
        return Boolean(this.provider === providers.youtube);
    }
    get isVimeo() {
        return Boolean(this.provider === providers.vimeo);
    }
    get isVideo() {
        return Boolean(this.type === types.video);
    }
    get isAudio() {
        return Boolean(this.type === types.audio);
    }

    /**
     * Play the media, or play the advertisement (if they are not blocked)
     */
    play() {
        if (!is.function(this.media.play)) {
            return null;
        }

        // Return the promise (for HTML5)
        return this.media.play();
    }

    /**
     * Pause the media
     */
    pause() {
        if (!this.playing || !is.function(this.media.pause)) {
            return;
        }

        this.media.pause();
    }

    /**
     * Get playing state
     */
    get playing() {
        return Boolean(this.ready && !this.paused && !this.ended);
    }

    /**
     * Get paused state
     */
    get paused() {
        return Boolean(this.media.paused);
    }

    /**
     * Get stopped state
     */
    get stopped() {
        return Boolean(this.paused && this.currentTime === 0);
    }

    /**
     * Get ended state
     */
    get ended() {
        return Boolean(this.media.ended);
    }

    /**
     * Toggle playback based on current status
     * @param {boolean} input
     */
    togglePlay(input) {
        // Toggle based on current state if nothing passed
        const toggle = is.boolean(input) ? input : !this.playing;

        if (toggle) {
            this.play();
        } else {
            this.pause();
        }
    }

    /**
     * Stop playback
     */
    stop() {
        if (this.isHTML5) {
            this.pause();
            this.restart();
        } else if (is.function(this.media.stop)) {
            this.media.stop();
        }
    }

    /**
     * Restart playback
     */
    restart() {
        this.currentTime = 0;
    }

    /**
     * Rewind
     * @param {number} seekTime - how far to rewind in seconds. Defaults to the config.seekTime
     */
    rewind(seekTime) {
        this.currentTime = this.currentTime - (is.number(seekTime) ? seekTime : this.config.seekTime);
    }

    /**
     * Fast forward
     * @param {number} seekTime - how far to fast forward in seconds. Defaults to the config.seekTime
     */
    forward(seekTime) {
        this.currentTime = this.currentTime + (is.number(seekTime) ? seekTime : this.config.seekTime);
    }

    /**
     * Seek to a time
     * @param {number} input - where to seek to in seconds. Defaults to 0 (the start)
     */
    set currentTime(input) {
        // Bail if media duration isn't available yet
        if (!this.duration) {
            return;
        }

        // Validate input
        const inputIsValid = is.number(input) && input > 0;

        // Set
        this.media.currentTime = inputIsValid ? Math.min(input, this.duration) : 0;

        // Logging
        this.debug.log(`Seeking to ${this.currentTime} seconds`);
    }

    /**
     * Get current time
     */
    get currentTime() {
        return Number(this.media.currentTime);
    }

    /**
     * Get buffered
     */
    get buffered() {
        const { buffered } = this.media;

        // YouTube / Vimeo return a float between 0-1
        if (is.number(buffered)) {
            return buffered;
        }

        // HTML5
        // TODO: Handle buffered chunks of the media
        // (i.e. seek to another section buffers only that section)
        if (buffered && buffered.length && this.duration > 0) {
            return buffered.end(0) / this.duration;
        }

        return 0;
    }

    /**
     * Get seeking status
     */
    get seeking() {
        return Boolean(this.media.seeking);
    }

    /**
     * Get the duration of the current media
     */
    get duration() {
        // Faux duration set via config
        const fauxDuration = parseFloat(this.config.duration);

        // Media duration can be NaN before the media has loaded
        const duration = (this.media || {}).duration || 0;

        // If config duration is funky, use regular duration
        return fauxDuration || duration;
    }

    /**
     * Set the player volume
     * @param {number} value - must be between 0 and 1. Defaults to the value from local storage and config.volume if not set in storage
     */
    set volume(value) {
        let volume = value;
        const max = 1;
        const min = 0;

        if (is.string(volume)) {
            volume = Number(volume);
        }

        // Load volume from storage if no value specified
        if (!is.number(volume)) {
            volume = this.storage.get('volume');
        }

        // Use config if all else fails
        if (!is.number(volume)) {
            ({ volume } = this.config);
        }

        // Maximum is volumeMax
        if (volume > max) {
            volume = max;
        }
        // Minimum is volumeMin
        if (volume < min) {
            volume = min;
        }

        // Update config
        this.config.volume = volume;

        // Set the player volume
        this.media.volume = volume;

        // If muted, and we're increasing volume manually, reset muted state
        if (!is.empty(value) && this.muted && volume > 0) {
            this.muted = false;
        }
    }

    /**
     * Get the current player volume
     */
    get volume() {
        return Number(this.media.volume);
    }

    /**
     * Increase volume
     * @param {boolean} step - How much to decrease by (between 0 and 1)
     */
    increaseVolume(step) {
        const volume = this.media.muted ? 0 : this.volume;
        this.volume = volume + (is.number(step) ? step : 1);
    }

    /**
     * Decrease volume
     * @param {boolean} step - How much to decrease by (between 0 and 1)
     */
    decreaseVolume(step) {
        const volume = this.media.muted ? 0 : this.volume;
        this.volume = volume - (is.number(step) ? step : 1);
    }

    set fullscreenContainer (container) {
        if (is.element(container)) {
            this.config.fullscreenContainer = container;
            ui.addStylehookToFullscreenContainer.call(this);
        }
    }

    /**
     * Set muted state
     * @param {boolean} mute
     */
    set muted(mute) {
        let toggle = mute;

        // Load muted state from storage
        if (!is.boolean(toggle)) {
            toggle = this.storage.get('muted');
        }

        // Use config if all else fails
        if (!is.boolean(toggle)) {
            toggle = this.config.muted;
        }

        // Update config
        this.config.muted = toggle;

        // Set mute on the player
        this.media.muted = toggle;
    }

    /**
     * Get current muted state
     */
    get muted() {
        return Boolean(this.media.muted);
    }

    /**
     * Check if the media has audio
     */
    get hasAudio() {
        // Assume yes for all non HTML5 (as we can't tell...)
        if (!this.isHTML5) {
            return true;
        }

        if (this.isAudio) {
            return true;
        }

        // Get audio tracks
        return (
            Boolean(this.media.mozHasAudio) ||
            Boolean(this.media.webkitAudioDecodedByteCount) ||
            Boolean(this.media.audioTracks && this.media.audioTracks.length)
        );
    }

    /**
     * Set playback speed
     * @param {number} speed - the speed of playback (0.5-2.0)
     */
    set speed(input) {
        let speed = null;

        if (is.number(input)) {
            speed = input;
        }

        if (!is.number(speed)) {
            speed = this.storage.get('speed');
        }

        if (!is.number(speed)) {
            speed = this.config.speed.selected;
        }

        // Set min/max
        if (speed < 0.1) {
            speed = 0.1;
        }
        if (speed > 2.0) {
            speed = 2.0;
        }

        if (!this.config.speed.options.includes(speed)) {
            this.debug.warn(`Unsupported speed (${speed})`);
            return;
        }

        // Update config
        this.config.speed.selected = speed;

        // Set media speed
        this.media.playbackRate = speed;
    }

    /**
     * Get current playback speed
     */
    get speed() {
        return Number(this.media.playbackRate);
    }

    /**
     * Set playback quality
     * Currently HTML5 & YouTube only
     * @param {number} input - Quality level
     */
    set quality(input) {
        const config = this.config.quality;
        const options = this.options.quality;

        if (!options.length) {
            return;
        }

        let quality = [
            !is.empty(input) && Number(input),
            this.storage.get('quality'),
            config.selected,
            config.default,
        ].find(is.number);

        if (!options.includes(quality)) {
            const value = closest(options, quality);
            this.debug.warn(`Unsupported quality option: ${quality}, using ${value} instead`);
            quality = value;
        }

        // Trigger request event
        triggerEvent.call(this, this.media, 'qualityrequested', false, { quality });

        // Update config
        config.selected = quality;

        // Set quality
        this.media.quality = quality;
    }

    /**
     * Get current quality level
     */
    get quality() {
        return this.media.quality;
    }

    /**
     * Toggle loop
     * TODO: Finish fancy new logic. Set the indicator on load as user may pass loop as config
     * @param {boolean} input - Whether to loop or not
     */
    set loop(input) {
        const toggle = is.boolean(input) ? input : this.config.loop.active;
        this.config.loop.active = toggle;
        this.media.loop = toggle;

        // Set default to be a true toggle
        /* const type = ['start', 'end', 'all', 'none', 'toggle'].includes(input) ? input : 'toggle';

        switch (type) {
            case 'start':
                if (this.config.loop.end && this.config.loop.end <= this.currentTime) {
                    this.config.loop.end = null;
                }
                this.config.loop.start = this.currentTime;
                // this.config.loop.indicator.start = this.elements.display.played.value;
                break;

            case 'end':
                if (this.config.loop.start >= this.currentTime) {
                    return this;
                }
                this.config.loop.end = this.currentTime;
                // this.config.loop.indicator.end = this.elements.display.played.value;
                break;

            case 'all':
                this.config.loop.start = 0;
                this.config.loop.end = this.duration - 2;
                this.config.loop.indicator.start = 0;
                this.config.loop.indicator.end = 100;
                break;

            case 'toggle':
                if (this.config.loop.active) {
                    this.config.loop.start = 0;
                    this.config.loop.end = null;
                } else {
                    this.config.loop.start = 0;
                    this.config.loop.end = this.duration - 2;
                }
                break;

            default:
                this.config.loop.start = 0;
                this.config.loop.end = null;
                break;
        } */
    }

    /**
     * Get current loop state
     */
    get loop() {
        return Boolean(this.media.loop);
    }

    /**
     * Set new media source
     * @param {object} input - The new source object (see docs)
     */
    set source(input) {
        source.change.call(this, input);
    }

    /**
     * Get current source
     */
    get source() {
        return this.media.currentSrc;
    }

    /**
     * Set the poster image for a video
     * @param {input} - the URL for the new poster image
     */
    set poster(input) {
        if (!this.isVideo) {
            this.debug.warn('Poster can only be set for video');
            return;
        }

        ui.setPoster.call(this, input, false).catch(() => {});
    }

    /**
     * Get the current poster image
     */
    get poster() {
        if (!this.isVideo) {
            return null;
        }

        return this.media.getAttribute('poster');
    }

    /**
     * Set the autoplay state
     * @param {boolean} input - Whether to autoplay or not
     */
    set autoplay(input) {
        const toggle = is.boolean(input) ? input : this.config.autoplay;
        this.config.autoplay = toggle;
    }

    /**
     * Get the current autoplay state
     */
    get autoplay() {
        return Boolean(this.config.autoplay);
    }

    /**
     * Toggle captions
     * @param {boolean} input - Whether to enable captions
     */
    toggleCaptions(input) {
        captions.toggle.call(this, input, false);
    }

    /**
     * Set the caption track by index
     * @param {number} - Caption index
     */
    set currentTrack(input) {
        captions.set.call(this, input, false);
    }

    /**
     * Get the current caption track index (-1 if disabled)
     */
    get currentTrack() {
        const { toggled, currentTrack } = this.captions;
        return toggled ? currentTrack : -1;
    }

    set captionPosition(input) {
        this.captions.position = input;
        this.storage.set({
            captionPosition: input,
        });
        captions.setPosition.call(this, this.captions.position);
    }

    get captionPosition() {
        return this.storage.get('captionPosition') || this.config.captions.position;
    }

    /**
     * Set the wanted language for captions
     * Since tracks can be added later it won't update the actual caption track until there is a matching track
     * @param {string} - Two character ISO language code (e.g. EN, FR, PT, etc)
     */
    set language(input) {
        captions.setLanguage.call(this, input, false);
    }

    /**
     * Get the current track's language
     */
    get language() {
        return (captions.getCurrentTrack.call(this) || {}).language;
    }

    /**
     * Toggle picture-in-picture playback on WebKit/MacOS
     * TODO: update player with state, support, enabled
     * TODO: detect outside changes
     */
    set pip(input) {
        const states = {
            pip: 'picture-in-picture',
            inline: 'inline',
        };

        // Bail if no support
        if (!support.pip) {
            return;
        }

        // Toggle based on current state if not passed
        const toggle = is.boolean(input) ? input : this.pip === states.inline;

        // Toggle based on current state
        this.media.webkitSetPresentationMode(toggle ? states.pip : states.inline);
    }

    /**
     * Get the current picture-in-picture state
     */
    get pip() {
        if (!support.pip) {
            return null;
        }

        return this.media.webkitPresentationMode;
    }

    /**
     * Trigger the airplay dialog
     * TODO: update player with state, support, enabled
     */
    airplay() {
        // Show dialog if supported
        if (support.airplay) {
            this.media.webkitShowPlaybackTargetPicker();
        }
    }

    /**
     * Toggle the player controls
     * @param {boolean} [toggle] - Whether to show the controls
     */
    toggleControls(toggle) {
        // Don't toggle if missing UI support or if it's audio
        if (this.supported.ui && !this.isAudio) {
            // Get state before change
            const isHidden = hasClass(this.elements.container, this.config.classNames.hideControls);

            // Negate the argument if not undefined since adding the class to hides the controls
            const force = typeof toggle === 'undefined' ? undefined : !toggle;

            // Apply and get updated state
            const hiding = toggleClass(this.elements.container, this.config.classNames.hideControls, force);

            // Close menu
            if (hiding && !is.empty(this.config.settings)) {
                controls.toggleMenu.call(this, false);
            }
            // Trigger event on change
            if (hiding !== isHidden) {
                const eventName = hiding ? 'controlshidden' : 'controlsshown';
                triggerEvent.call(this, this.media, eventName);
            }
            return !hiding;
        }
        return false;
    }

    /**
     * Add event listeners
     * @param {string} event - Event type
     * @param {function} callback - Callback for when event occurs
     */
    on(event, callback) {
        on.call(this, this.elements.container, event, callback);
    }
    /**
     * Add event listeners once
     * @param {string} event - Event type
     * @param {function} callback - Callback for when event occurs
     */
    once(event, callback) {
        once.call(this, this.elements.container, event, callback);
    }
    /**
     * Remove event listeners
     * @param {string} event - Event type
     * @param {function} callback - Callback for when event occurs
     */
    off(event, callback) {
        off(this.elements.container, event, callback);
    }

    /**
     * Destroy an instance
     * Event listeners are removed when elements are removed
     * http://stackoverflow.com/questions/12528049/if-a-dom-element-is-removed-are-its-listeners-also-removed-from-memory
     * @param {function} callback - Callback for when destroy is complete
     * @param {boolean} soft - Whether it's a soft destroy (for source changes etc)
     */
    destroy(callback, soft = false) {
        if (!this.ready) {
            return;
        }

        const done = () => {
            // Reset overflow (incase destroyed while in fullscreen)
            document.body.style.overflow = '';

            // GC for embed
            this.embed = null;

            // If it's a soft destroy, make minimal changes
            if (soft) {
                if (Object.keys(this.elements).length) {
                    // Remove elements
                    removeElement(this.elements.buttons.play);
                    removeElement(this.elements.captions);
                    removeElement(this.elements.controls);
                    removeElement(this.elements.wrapper);

                    // Clear for GC
                    this.elements.buttons.play = null;
                    this.elements.captions = null;
                    this.elements.controls = null;
                    this.elements.wrapper = null;
                }

                // Callback
                if (is.function(callback)) {
                    callback();
                }
            } else {
                // Unbind listeners
                unbindListeners.call(this);

                // Replace the container with the original element provided
                replaceElement(this.elements.original, this.elements.container);

                // Event
                triggerEvent.call(this, this.elements.original, 'destroyed', true);

                // Callback
                if (is.function(callback)) {
                    callback.call(this.elements.original);
                }

                // Reset state
                this.ready = false;

                // Clear for garbage collection
                setTimeout(() => {
                    this.elements = null;
                    this.media = null;
                }, 200);
            }
        };

        // Stop playback
        this.stop();

        // Provider specific stuff
        if (this.isHTML5) {
            // Clear timeout
            clearTimeout(this.timers.loading);

            // Restore native video controls
            ui.toggleNativeControls.call(this, true);

            // Clean up
            done();
        } else if (this.isYouTube) {
            // Clear timers
            clearInterval(this.timers.buffering);
            clearInterval(this.timers.playing);

            // Destroy YouTube API
            if (this.embed !== null && is.function(this.embed.destroy)) {
                this.embed.destroy();
            }

            // Clean up
            done();
        } else if (this.isVimeo) {
            // Destroy Vimeo API
            // then clean up (wait, to prevent postmessage errors)
            if (this.embed !== null) {
                this.embed.unload().then(done);
            }

            // Vimeo does not always return
            setTimeout(done, 200);
        }
    }

    /**
     * Check for support for a mime type (HTML5 only)
     * @param {string} type - Mime type
     */
    supports(type) {
        return support.mime.call(this, type);
    }

    /**
     * Check for support
     * @param {string} type - Player type (audio/video)
     * @param {string} provider - Provider (html5/youtube/vimeo)
     * @param {bool} inline - Where player has `playsinline` sttribute
     */
    static supported(type, provider, inline) {
        return support.check(type, provider, inline);
    }

    /**
     * Load an SVG sprite into the page
     * @param {string} url - URL for the SVG sprite
     * @param {string} [id] - Unique ID
     */
    static loadSprite(url, id) {
        return loadSprite(url, id);
    }

    /**
     * Setup multiple instances
     * @param {*} selector
     * @param {object} options
     */
    static setup(selector, options = {}) {
        let targets = null;

        if (is.string(selector)) {
            targets = Array.from(document.querySelectorAll(selector));
        } else if (is.nodeList(selector)) {
            targets = Array.from(selector);
        } else if (is.array(selector)) {
            targets = selector.filter(is.element);
        }

        if (is.empty(targets)) {
            return null;
        }

        return targets.map(t => new Plyr(t, options));
    }
}

Plyr.defaults = cloneDeep(defaults);
Plyr.hahow = hahow;
export default Plyr;
