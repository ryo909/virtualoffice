// main.js - Main application state and logic

import { loadMaps, getSpawnPoint, getSpotById, setActiveArea, getSpots, getWorldModel, getActiveArea } from './world/mapLoader.js';
import {
    initRenderer, render, worldToScreen, screenToWorld,
    updateCamera, applyZoom, setShowDebugSpots, getCamera,
    setBackgroundSrc
} from './world/mapRenderer.js';
import {
    initMovement, updateMovement, getCurrentPos,
    getFacing, getIsMoving, setMoveTarget,
    stopMoving, setPosition, getTarget, lastPathResult, teleportTo
} from './world/movement.js';
import { canMoveTo, canMoveToDebug } from './world/collision.js';
import { getSpotAt, getNearbyDesk, getClickableAt, getLocationLabel, getSortedSpotsAt } from './world/spotLogic.js';
import { warpNearUser } from './world/warp.js';
import { initDebugHud, updateDebugHud } from './ui/debugHud.js';
import { updateAnimation } from './avatar/pixelSpriteRenderer.js';
import { renderMinimap } from './ui/minimap.js';

import { getConfig, getSupabase } from './services/supabaseClient.js';
import { upsertNameplate, isDisplayNameTaken, getNameplateBySessionId } from './services/db.js';
import { initRealtime, joinPresence, updatePresence, subscribeEvents, sendEventTo, shutdownRealtime } from './services/realtime.js';

import { initMenubar, openDrawer, closeDrawer, updateDisplayName, updateStatus } from './ui/menubar.js';
import { showToast, showPokeToast } from './ui/toast.js';
import { initChatDrawer, setChatDrawerOpen } from './ui/drawer.chat.js';
import { initPeopleDrawer, updatePeople, getPeople } from './ui/drawer.people.js';
import { initSearchDrawer, refreshSearch } from './ui/drawer.search.js';
import { initSettingsDrawer, applyTheme, setDisplayNameInput, setActiveStatus, setActiveTheme } from './ui/drawer.settings.js';
import { initPasswordModal, showPasswordModal, hidePasswordModal } from './ui/modal.password.js';
import { initNameplateModal, showNameplateModal, hideNameplateModal, showNameplateError } from './ui/modal.nameplate.js';
import { initIncomingCallModal, showIncomingCallModal, hideIncomingCallModal } from './ui/modal.incomingCall.js';
import { initContextPanel, showContextPanel, hideContextPanel, loadRoomSettings, updateDeskPanel } from './ui/panel.context.js';
import { initSpotModal, showToolLinksModal, showBulletinModal, hideSpotModal, isSpotModalVisible } from './ui/modal.spot.js';
import { initAdminModal, showAdminModal, hideAdminModal, isAdminModalVisible } from './ui/modal.admin.js';
import { initBgmModal, showBgmModal, hideBgmModal } from './ui/modal.bgm.js';
import { initBgmManager, unlockAudio, playTrack, stop, setAreaId as setBgmArea, getState as getBgmState } from './audio/bgmManager.js';
import { loadGallery, loadNews, getGallery, getNews } from './data/contentLoader.js';
import { GARDEN_BGM_TRACKS, resolveBgmUrl, DEFAULT_GARDEN_BGM_ID } from './data/gardenBgmTracks.js';
import { initAmbientModal, showAmbientModal, hideAmbientModal } from './ui/modal.ambient.js';
import { setAmbientPreset } from './world/ambientParticles.js';
import { DEFAULT_AMBIENT_PRESET_ID } from './data/ambientPresets.js';
import { nextTimeOfDay, getTimePreset } from './data/timeOfDay.js';
import { initModal, closeModal } from './ui/modal.js';
import { openProfileEditor, openDirectorySearch, openRecentUpdates, openProfileViewer } from './library/libraryActions.js';

import { initCallStateMachine, getCallState } from './call/callStateMachine.js';
import { initSignaling, startCall, acceptIncomingCall, hangUp, handleCallEvent } from './call/signaling.js';
import { initWebRTC } from './call/webrtc.js';
import {
    initDeskCall,
    joinDeskCall,
    leaveDeskCall,
    toggleDeskMute,
    hangupDeskCall
} from './call/deskCall.js';

import { getSessionId, setSessionId, getSavedPassword, setSavedPassword, clearSavedPassword, getDisplayName, setDisplayName, getThemeId, getTimeMode, setTimeMode } from './utils/storage.js';
import { generateSessionId } from './utils/ids.js';

// ========== Application State ==========
const state = {
    ui: {
        drawer: 'none',
        chatTab: 'all',
        selected: null,
        modal: 'none',
        themeId: 'theme:day',
        timeMode: 'day',
        toastQueue: []
    },
    world: {
        areaId: 'area:core',
        pos: { x: 260, y: 260 },
        facing: 'down',
        seatedDeskId: null,
        insideSpotId: null,
        forcedSeated: false
    },
    me: {
        actorId: null,
        displayName: '',
        status: 'online',
        avatar: { key: null, color: null }
    },
    queuedAction: null, // { spotId, actionType }
    rt: {
        people: new Map()
    },
    call: {
        state: 'idle',
        peerActorId: null,
        callId: null,
        lastError: null
    },
    debug: {
        showSpots: false,
        canMoveTo: null,
        lastPathResult: null
    }
};

let lastFrameTime = 0;
let lastActivityTime = Date.now();
let animationFrameId = null;
let config = null;
let deskCallState = { status: 'idle' };
let prevPosBeforeSit = null;
let isMapSwitching = false;

// Debug object for coordinate verification
const debug = {
    lastClick: null,
    lastWorldPos: null,
    canMoveTo: null
};

const SPOT_COOLDOWN_MS = 1500;
let lastOpenedSpotId = null;
let lastOpenedAt = 0;
let nearbySpotId = null;
let interactHintEl = null;

function setWorldLoading(isLoading) {
    const world = getWorldModel();
    if (!world) return;
    world.isMapLoading = isLoading;
    world.isReady = !isLoading;
}

function resolveGardenTracksSafe() {
    const activeArea = getActiveArea?.() || state.world.areaId || 'area:core';
    const base = getBaseUrlSafe();
    try {
        const tracks = (GARDEN_BGM_TRACKS || []).map((track) => ({
            ...track,
            url: resolveBgmUrl(track.file),
            src: resolveBgmUrl(track.file)
        }));
        return tracks;
    } catch (err) {
        console.warn('[BGM] resolveGardenTracks failed; continue without BGM', {
            activeArea,
            base,
            trackCount: Array.isArray(GARDEN_BGM_TRACKS) ? GARDEN_BGM_TRACKS.length : 0,
            err
        });
        return [];
    }
}

function getBaseUrlSafe() {
    try {
        const base = import.meta?.env?.BASE_URL;
        if (typeof base === 'string' && base.length) return base;
    } catch (_) {
        // noop
    }
    return '/';
}

function enforceBgmAreaRule() {
    const area = getActiveArea?.() || state.world.areaId || 'area:core';
    if (area !== 'area:garden') {
        stop();
    }
}

// ========== Initialization ==========
export async function initApp(appConfig, session) {
    config = appConfig;
    if (window.DEBUG_COLLISION === undefined) {
        window.DEBUG_COLLISION = false;
    }

    // Get or create session ID
    let sessionId = getSessionId();
    if (!sessionId) {
        sessionId = generateSessionId();
        setSessionId(sessionId);
    }
    state.me.actorId = sessionId;

    // Load saved theme
    const savedTheme = getThemeId();
    if (savedTheme) {
        state.ui.themeId = savedTheme;
        applyTheme(savedTheme);
        setActiveTheme(savedTheme);
    }

    state.ui.timeMode = getTimeMode();
    console.log('[TimeMode] restored from storage', { timeMode: state.ui.timeMode });

    // Boot logging helper
    const bootLog = (msg) => {
        if (window.bootLog) window.bootLog(msg);
        else console.log('[BOOT-Main]', msg);
    };

    bootLog('app: init start');

    // Watchdog for map loading
    const watchdog = setTimeout(() => {
        if (window.showFatal) {
            window.showFatal('起動がタイムアウトしました（10秒）。\nJSON読込/JS例外/パス不整合の可能性が高いです。');
        }
    }, 10000);

    // Load maps
    try {
        bootLog('app: calling loadMaps');
        await loadMaps('core');
        bootLog('app: loadMaps done');
        clearTimeout(watchdog);
    } catch (err) {
        clearTimeout(watchdog);
        throw err;
    }

    // Load room settings
    await loadRoomSettings();

    // Initialize renderer
    const canvas = document.getElementById('map-canvas');
    await initRenderer(canvas);
    console.log('[Map] current meta.id', getWorldModel()?.meta?.id);

    // Initialize debug HUD (development only)
    initDebugHud();

    // Set spawn position
    const spawn = getSpawnPoint('lobby');
    state.world.pos = { ...spawn };

    // Initialize movement
    setWorldLoading(true);
    initMovement(spawn, (pos, facing, moving) => {
        state.world.pos = pos;
        state.world.facing = facing;

        // Update presence
        if (state.me.actorId) {
            updatePresence({
                actorId: state.me.actorId,
                displayName: state.me.displayName,
                status: state.me.status,
                pos: pos,
                facing: facing,
                location: getLocationLabel(state.world.insideSpotId, state.world.seatedDeskId, state.world.areaId)
            });
        }

        // Check spot entry/exit
        const spot = getSpotAt(pos.x, pos.y);
        if (spot?.id !== state.world.insideSpotId) {
            state.world.insideSpotId = spot?.id || null;
            // Note: Action spots are handled via click, not walk-in
        }
    });

    setWorldLoading(false);

    // Initialize UI modules
    initMenubar((drawer) => {
        state.ui.drawer = drawer;
        updateDrawerUI();
    });

    initChatDrawer({
        getMyName: () => state.me.displayName || 'anonymous'
    });

    initPeopleDrawer({
        warpCallback: (person) => {
            warpNearUser(person.pos);
            closeDrawer();
            showToast(`Warped near ${person.displayName}`);
        },
        pokeCallback: (person) => {
            sendPoke(person.actorId);
            showToast(`Poked ${person.displayName}`);
        },
        dmCallback: () => {
            openDrawer('chat');
        }
    });

    initSearchDrawer({
        warpCallback: (person) => {
            warpNearUser(person.pos);
            closeDrawer();
            showToast(`Warped near ${person.displayName}`);
        }
    });

    initSettingsDrawer({
        nameChangeCallback: async (name) => {
            try {
                const taken = await isDisplayNameTaken(name, state.me.actorId);
                if (taken) {
                    showToast('この名前は既に使われています', 'error');
                    return;
                }

                await upsertNameplate({
                    sessionId: state.me.actorId,
                    displayName: name
                });

                state.me.displayName = name;
                setDisplayName(name);
                updateDisplayName(name);

                showToast('名前を更新しました', 'success');
            } catch (err) {
                showToast('更新に失敗しました', 'error');
            }
        },
        statusChangeCallback: (status) => {
            state.me.status = status;
            updateStatus(status);
            updatePresence({
                actorId: state.me.actorId,
                status: status
            });
        },
        logoutCallback: async () => {
            await shutdownRealtime();
            await getSupabase().auth.signOut();
            clearSavedPassword();
            window.location.reload();
        },
        clearPasswordCallback: () => {
            clearSavedPassword();
            showToast('保存されたパスワードを削除しました', 'success');
        }
    });

    function setActiveAreaButton(areaId) {
        const options = document.querySelectorAll('#area-options .theme-option');
        options.forEach(opt => {
            opt.classList.toggle('active', opt.dataset.area === areaId);
        });
    }

    const areaOptions = document.querySelectorAll('#area-options .theme-option');
    areaOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            const areaId = opt.dataset.area;
            if (!areaId) return;
            setActiveAreaButton(areaId);
            void switchArea(areaId);
        });
    });
    setActiveAreaButton(state.world.areaId);

    initContextPanel({
        openZoom: (url) => {
            window.open(url, '_blank');
        },
        openRoomChat: (spotId) => {
            openDrawer('chat');
        },
        sit: (desk) => {
            if (state.world.seatedDeskId && state.world.seatedDeskId !== desk.id) {
                leaveDeskCall();
            }
            state.world.seatedDeskId = desk.id;
            state.world.forcedSeated = false;
            const p = getCurrentPos();
            prevPosBeforeSit = { x: p.x, y: p.y };
            if (desk.standPoint) {
                teleportTo(desk.standPoint.x, desk.standPoint.y);
            } else if (desk.pos) {
                teleportTo(desk.pos.x, desk.pos.y);
            }
            hideContextPanel();
            refreshDeskPanel();
        },
        stand: () => {
            state.world.seatedDeskId = null;
            state.world.forcedSeated = false;
            leaveDeskCall();
            stopMoving();
            if (prevPosBeforeSit) {
                teleportTo(prevPosBeforeSit.x, prevPosBeforeSit.y);
                prevPosBeforeSit = null;
            }
            hideContextPanel();
            refreshDeskPanel();
        },
        poke: (person) => {
            sendPoke(person.actorId);
            showToast(`Poked ${person.displayName}`);
        },
        dm: () => {
            openDrawer('chat');
        },
        call: (person) => {
            startCall(person.actorId);
        },
        deskCallJoin: (desk) => {
            joinDeskCall(desk.id);
            refreshDeskPanel();
        },
        deskCallMute: () => {
            toggleDeskMute();
            refreshDeskPanel();
        },
        deskCallHangup: () => {
            hangupDeskCall();
            refreshDeskPanel();
        }
    });

    function buildContextMeta(selection) {
        if (selection?.kind !== 'desk') return {};
        return {
            seated: state.world.seatedDeskId === selection.data.id,
            callState: deskCallState,
            forced: state.world.forcedSeated === true && state.world.seatedDeskId === selection.data.id
        };
    }

    function refreshDeskPanel() {
        const selection = state.ui.selected;
        if (selection?.kind !== 'desk') return;
        updateDeskPanel(
            selection.data,
            state.world.seatedDeskId === selection.data.id,
            null,
            deskCallState,
            state.world.forcedSeated === true
        );
    }

    initIncomingCallModal({
        acceptCallback: async () => {
            await acceptIncomingCall();
        },
        rejectCallback: () => {
            hangUp();
        }
    });

    // Initialize spot modal
    initSpotModal();
    initBgmManager();
    setBgmArea(state.world.areaId);
    initBgmModal();
    applyAreaBgm(state.world.areaId);
    initAmbientModal();
    initModal();
    initAdminModal();

    // Load dynamic content
    loadGallery();
    loadNews();

    try {
        const storedPreset = localStorage.getItem('ambientPreset:garden');
        const preset = storedPreset || DEFAULT_AMBIENT_PRESET_ID;
        setAmbientPreset(preset);
    } catch (err) {
        console.warn('[Ambient] preset init failed', err);
    }

    // Initialize call modules
    initCallStateMachine((callState, prevState) => {
        state.call = callState;

        if (callState.state === 'incoming') {
            const caller = getPeople().get(callState.peerActorId);
            showIncomingCallModal(caller?.displayName || 'Unknown');
        } else if (prevState === 'incoming' && callState.state !== 'incoming') {
            hideIncomingCallModal();
        }

        if (callState.state === 'error') {
            showToast(callState.lastError || 'Call failed', 'error');
        }
    });

    initWebRTC({
        onIceCandidate: (candidate) => {
            if (state.call.peerActorId) {
                sendEventTo(state.call.peerActorId, {
                    type: 'call_ice_candidate',
                    payload: { candidate }
                });
            }
        },
        onTrack: (stream) => {
            // Play remote audio
            const audio = new Audio();
            audio.srcObject = stream;
            audio.play();
        },
        onConnectionStateChange: (connectionState) => {
            console.log('WebRTC connection state:', connectionState);
        }
    });

    initSignaling({ actorId: state.me.actorId });

    initDeskCall({
        sessionId: state.me.actorId,
        onStateChange: (nextState) => {
            deskCallState = nextState;
            refreshDeskPanel();
        }
    });

    // Initialize realtime
    initRealtime({
        supabase: getSupabase(),
        me: state.me,
        onPresenceChange: (presenceState) => {
            state.rt.people = new Map();
            Object.entries(presenceState).forEach(([key, presences]) => {
                if (presences && presences.length > 0) {
                    const p = presences[0];
                    if (p.actorId !== state.me.actorId) {
                        state.rt.people.set(p.actorId, p);
                    }
                }
            });
            updatePeople(presenceState);
            refreshSearch();
        },
        onEvent: (event) => {
            handleEvent(event);
        }
    });

    // Keyboard events
    window.addEventListener('keydown', (e) => {
        // Chat focus check
        if (state.ui.modal !== 'none' && state.ui.modal !== 'chat') return;

        if (e.code === 'Enter') {
            if (document.activeElement === document.getElementById('chat-input')) {
                // Send message logic handled in chat module
            } else {
                document.getElementById('chat-input')?.focus();
            }
        }

        // Debug toggle (F3)
        if (e.code === 'F3') {
            e.preventDefault();
            state.debug.showSpots = !state.debug.showSpots;
            setShowDebugSpots(state.debug.showSpots);
            console.log('[Debug] Spots overlay:', state.debug.showSpots ? 'ON' : 'OFF');
        }

        if (e.key.toLowerCase() === 'e') {
            if (nearbySpotId) {
                const now = Date.now();
                if (nearbySpotId === lastOpenedSpotId && now - lastOpenedAt < SPOT_COOLDOWN_MS) {
                    return;
                }
                const spot = getSpotById(nearbySpotId);
                if (spot?.action) {
                    e.preventDefault();
                    lastOpenedSpotId = nearbySpotId;
                    lastOpenedAt = now;
                    handleSpotAction(spot.action, spot);
                }
            }
        }
    });

    // Subscribe to events
    subscribeEvents({ myActorId: state.me.actorId });

    // Helper: Check if click is on UI element
    function isUiClick(target) {
        return target.closest('#menubar, #drawer, #modal-overlay, #context-panel, #minimap, button, input, textarea, a, .toast, .spot-modal-overlay');
    }

    function ensureInteractHint() {
        if (interactHintEl) return interactHintEl;
        interactHintEl = document.createElement('div');
        interactHintEl.id = 'interact-hint';
        document.getElementById('app').appendChild(interactHintEl);
        return interactHintEl;
    }

    function setInteractHint(spot) {
        const el = ensureInteractHint();
        if (!spot) {
            el.classList.remove('visible');
            el.textContent = '';
            return;
        }
        const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        el.textContent = isTouch ? 'Tap: Open' : 'E: Open';
        el.classList.add('visible');
    }

    function getInteractPoint(spot) {
        if (spot?.interactPoint) return spot.interactPoint;
        if (spot?.bounds) {
            return {
                x: spot.bounds.x + spot.bounds.w / 2,
                y: spot.bounds.y + spot.bounds.h / 2
            };
        }
        if (spot?.x !== undefined && spot?.y !== undefined) {
            return { x: spot.x, y: spot.y };
        }
        return null;
    }

    function getNearestInteractSpot(pos) {
        const spots = getSpots();
        let best = null;
        let bestDist = Infinity;
        spots.forEach(spot => {
            if (!spot?.action) return;
            const target = getInteractPoint(spot);
            if (!target) return;
            const dx = pos.x - target.x;
            const dy = pos.y - target.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const proximity = spot.proximity || 90;
            if (dist <= proximity && dist < bestDist) {
                best = spot;
                bestDist = dist;
            }
        });
        return best;
    }

    // Canvas click handler (pointerdown for better touch support)
    const canvasContainer = document.getElementById('canvas-container');
    // Set touch-action to prevent scroll hijacking
    canvas.style.touchAction = 'none';
    canvasContainer.style.touchAction = 'none';

    canvasContainer.addEventListener('pointerdown', (e) => {
        // Left click only
        if (e.button !== 0) return;

        // Skip if clicking on UI elements
        if (isUiClick(e.target)) return;

        unlockAudio();

        // Prevent default to avoid scroll/zoom on touch
        e.preventDefault();

        lastActivityTime = Date.now();

        const rect = canvas.getBoundingClientRect();
        const rectX = e.clientX - rect.left;
        const rectY = e.clientY - rect.top;

        // Convert to world coordinates
        const worldPos = screenToWorld(rectX, rectY);

        if (e.shiftKey) {
            console.log('[COORD]', { x: Math.round(worldPos.x), y: Math.round(worldPos.y) });
        }

        console.log('[MOVE] click received', {
            seated: state.world.seatedDeskId != null,
            forcedSeated: state.world.forcedSeated === true,
            inputTarget: getTarget(),
            isMoving: getIsMoving()
        });

        // Debug logging
        const sortedSpots = getSortedSpotsAt(worldPos.x, worldPos.y);
        console.log('[Click]', {
            screenX: rectX,
            screenY: rectY,
            worldX: Math.round(worldPos.x),
            worldY: Math.round(worldPos.y),
            hits: sortedSpots.map(h => `${h.id}(P:${h.priority || 0})`)
        });

        const clickable = getClickableAt(worldPos.x, worldPos.y);

        if (clickable.kind === 'spot' && clickable.data?.action) {
            // Action spot (gallery, bulletin, admin) - show modal
            handleSpotAction(clickable.data.action, clickable.data);
        } else if (clickable.kind) {
            // Other clickable (zoom room, desk) - show context panel
            state.ui.selected = clickable;
            showContextPanel(clickable, buildContextMeta(clickable));
            hideSpotModal(); // Close spot modal if open
        } else {
            state.ui.selected = null;
            hideContextPanel();
            hideSpotModal(); // Close spot modal if open

            // Only move if position is valid or let movement handle constrain
            setMoveTarget(worldPos.x, worldPos.y);

            // Show click marker
            showClickMarker(worldPos.x, worldPos.y);
        }
    });

    // Mouse wheel zoom handler
    canvasContainer.addEventListener('wheel', (e) => {
        e.preventDefault();

        // Skip if on UI elements
        if (isUiClick(e.target)) return;

        lastActivityTime = Date.now();

        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        // Apply zoom with cursor as pivot
        applyZoom(e.deltaY, screenX, screenY);
    }, { passive: false });

    function resolveBgForArea(areaId) {
        if (areaId === 'area:garden') return './assets/maps/garden_day.png';
        if (areaId === 'area:library') return './assets/maps/library.png';
        return './assets/maps/map.png'; // office
    }

    function resolveSpawnNameForArea(areaId) {
        if (areaId === 'area:garden') return 'garden';
        if (areaId === 'area:library') return 'lobby';
        return 'lobby';
    }

    function resolveAreaKey(areaId) {
        if (areaId === 'area:garden') return 'garden';
        if (areaId === 'area:library') return 'library';
        return 'core';
    }

    function findGardenTrack(trackId) {
        return resolveGardenTracksSafe().find(track => track.id === trackId) || null;
    }

    function applyAreaBgm(areaId) {
        setBgmArea(areaId);
        if (areaId === 'area:garden') {
            const stored = localStorage.getItem('bgm:garden:selected');
            const selectedId = stored && stored.length ? stored : DEFAULT_GARDEN_BGM_ID;

            if (selectedId === 'none') {
                stop();
                return;
            }

            const track = findGardenTrack(selectedId) || findGardenTrack(DEFAULT_GARDEN_BGM_ID);
            if (track) {
                void playTrack(track, { areaId });
            }
        } else {
            stop();
        }
        enforceBgmAreaRule();
    }

    async function switchArea(areaId) {
        try {
            if (areaId !== 'area:garden') {
                setBgmArea(areaId);
                stop();
            }
            isMapSwitching = true;
            setWorldLoading(true);
            // 1) stop all interactions
            state.ui.selected = null;
            state.queuedAction = null;
            state.world.insideSpotId = null;
            hideContextPanel();
            hideSpotModal();
            hideBgmModal();
            hideAmbientModal();
            closeModal();
            nearbySpotId = null;
            lastOpenedSpotId = null;
            lastOpenedAt = 0;
            setInteractHint(null);

            // 2) movement reset
            stopMoving();

            // 3) seating/call reset
            if (state.world.seatedDeskId) {
                leaveDeskCall();
            }
            state.world.seatedDeskId = null;
            state.world.forcedSeated = false;
            prevPosBeforeSit = null;

            // 4) switch active world
            const areaKey = resolveAreaKey(areaId);
            await loadMaps(areaKey);
            setActiveArea(areaId);
            state.world.areaId = areaId;
            enforceBgmAreaRule();

            // 5) teleport to spawn
            const spawnName = resolveSpawnNameForArea(areaId);
            const sp = getSpawnPoint(spawnName);
            teleportTo(sp.x, sp.y);
            updateCamera(sp.x, sp.y, 16.67);

            // 6) update background
            const bg = resolveBgForArea(areaId);
            await setBackgroundSrc(bg);

            // 7) update BGM state
            applyAreaBgm(areaId);

            setActiveAreaButton(areaId);

            showToast(`Switched: ${areaId}`, 'success');
            console.log('[Area] switched', { areaId, spawnName, sp, bg });
        } catch (e) {
            console.error('[Area] switch failed', e);
            showToast('Area switch failed', 'error');
        } finally {
            setWorldLoading(false);
            isMapSwitching = false;
        }
    }

    // Keyboard handler
    const keys = { up: false, down: false, left: false, right: false, w: false, a: false, s: false, d: false };

    document.addEventListener('keydown', (e) => {
        lastActivityTime = Date.now();

        const tag = (document.activeElement?.tagName || '').toLowerCase();
        const isTypingTarget = tag === 'input' || tag === 'textarea' || tag === 'select' || document.activeElement?.isContentEditable;
        if (isTypingTarget) return;

        if (e.key === 'ArrowUp') keys.up = true;
        if (e.key === 'ArrowDown') keys.down = true;
        if (e.key === 'ArrowLeft') keys.left = true;
        if (e.key === 'ArrowRight') keys.right = true;
        if (e.key.toLowerCase() === 'w') keys.w = true;
        if (e.key.toLowerCase() === 'a') keys.a = true;
        if (e.key.toLowerCase() === 's') keys.s = true;
        if (e.key.toLowerCase() === 'd') keys.d = true;

        // Debug keys
        if (e.key === 'F9') {
            window.DEBUG_COLLISION = !window.DEBUG_COLLISION;
            console.log('[DEBUG] Collision Debug', window.DEBUG_COLLISION ? 'ON' : 'OFF');
        }
        if (e.key === 'F6') {
            const forced = state.world.forcedSeated;
            if (forced) {
                state.world.seatedDeskId = null;
                state.world.forcedSeated = false;
                leaveDeskCall();
                showToast('Forced seat cleared', 'info');
            } else {
                const p = getCurrentPos();
                const nearest = getNearbyDesk(p.x, p.y);
                if (nearest) {
                    state.world.seatedDeskId = nearest.id;
                    state.world.forcedSeated = true;
                    showToast(`Seated: ${nearest.id} (forced)`, 'info');
                } else {
                    showToast('No nearby desk found', 'error');
                }
            }
            refreshDeskPanel();
        }
        // Area switch (g: garden, o: office)
        if (e.key.toLowerCase() === 'g') {
            void switchArea('area:garden');
        }
        if (e.key.toLowerCase() === 'o') {
            void switchArea('area:core');
        }
        if (e.key.toLowerCase() === 'l') {
            if (e.repeat) return;
            const nextArea = (state.world.areaId === 'area:library') ? 'area:core' : 'area:library';
            if (!getWorldModel(nextArea)) {
                console.warn('[Area] missing id:', nextArea);
                return;
            }
            void switchArea(nextArea);
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowUp') keys.up = false;
        if (e.key === 'ArrowDown') keys.down = false;
        if (e.key === 'ArrowLeft') keys.left = false;
        if (e.key === 'ArrowRight') keys.right = false;
        if (e.key.toLowerCase() === 'w') keys.w = false;
        if (e.key.toLowerCase() === 'a') keys.a = false;
        if (e.key.toLowerCase() === 's') keys.s = false;
        if (e.key.toLowerCase() === 'd') keys.d = false;
    });

    // Presence throttling state
    let lastPresenceSent = 0;
    let lastSentPos = { x: 0, y: 0 };
    const PRESENCE_INTERVAL_MS = 200;
    const PRESENCE_DISTANCE_THRESHOLD = 6;

    // Click marker state
    let clickMarker = null;
    let clickMarkerTime = 0;
    const CLICK_MARKER_DURATION = 500;

    function showClickMarker(x, y) {
        clickMarker = { x, y };
        clickMarkerTime = Date.now();
    }

    // Start game loop
    function gameLoop(timestamp) {
        const deltaMs = timestamp - lastFrameTime;
        lastFrameTime = timestamp;

        if (isMapSwitching || getWorldModel()?.isMapLoading || !getWorldModel()?.isReady) {
            setInteractHint(null);
            animationFrameId = requestAnimationFrame(gameLoop);
            return;
        }

        // Update movement
        updateMovement(deltaMs);

        // Get current position
        const pos = getCurrentPos();
        const target = getTarget();
        const isMoving = getIsMoving();

        // Update avatar animation
        const dx = target ? target.x - pos.x : 0;
        const dy = target ? target.y - pos.y : 0;
        updateAnimation(state.me.actorId || 'me', isMoving, dx, dy, deltaMs);

        // Update camera with deltaMs for FPS-independent smoothing
        updateCamera(pos.x, pos.y, deltaMs);

        // Throttled presence update
        const now = Date.now();
        const distMoved = Math.sqrt(
            Math.pow(pos.x - lastSentPos.x, 2) +
            Math.pow(pos.y - lastSentPos.y, 2)
        );

        if (distMoved > PRESENCE_DISTANCE_THRESHOLD || now - lastPresenceSent > PRESENCE_INTERVAL_MS) {
            if (distMoved > 0.1) { // Only send if actually moved
                updatePresence({
                    actorId: state.me.actorId,
                    displayName: state.me.displayName,
                    status: state.me.status,
                    pos: pos,
                    facing: getFacing(),
                    location: getLocationLabel(state.world.insideSpotId, state.world.seatedDeskId, state.world.areaId)
                });
                lastSentPos = { ...pos };
                lastPresenceSent = now;
            }
        }

        // Check away status
        if (config.presence?.awayAfterMs) {
            const elapsed = now - lastActivityTime;
            if (elapsed > config.presence.awayAfterMs && state.me.status === 'online') {
                state.me.status = 'away';
                updateStatus('away');
                updatePresence({ status: 'away' });
            }
        }

        // Clear expired click marker
        if (clickMarker && now - clickMarkerTime > CLICK_MARKER_DURATION) {
            clickMarker = null;
        }

        const nearSpot = getNearestInteractSpot(pos);
        nearbySpotId = nearSpot?.id || null;
        setInteractHint(nearSpot);

        enforceBgmAreaRule();
        if (state.world.areaId !== 'area:garden' && getBgmState().isPlaying) {
            stop();
        }

        // Render
        const otherPlayers = Array.from(state.rt.people.values()).map(p => ({
            pos: p.pos || { x: 0, y: 0 },
            displayName: p.displayName || 'Unknown',
            status: p.status || 'online',
            avatarColor: p.avatarColor,
            actorId: p.actorId
        }));

        if (!isMapSwitching) {
            render(
                pos,
                getFacing(),
                otherPlayers,
                state.me,
                clickMarker,
                clickMarkerTime,
                deltaMs,
                state.world.areaId,
                state.ui.timeMode
            );
        }

        // Render minimap
        const minimapCanvas = document.getElementById('minimap-canvas');
        if (minimapCanvas) {
            renderMinimap(minimapCanvas, pos, otherPlayers);
        }

        // Process queued action (auto-approach)
        if (state.queuedAction) {
            const spot = getSpotById(state.queuedAction.spotId);
            if (spot) {
                const targetPos = spot.interactPoint || {
                    x: spot.bounds ? spot.bounds.x + spot.bounds.w / 2 : (spot.x || 0),
                    y: spot.bounds ? spot.bounds.y + spot.bounds.h / 2 : (spot.y || 0)
                };

                const pos = getCurrentPos();
                const dx = pos.x - targetPos.x;
                const dy = pos.y - targetPos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const proximity = spot.proximity || 90;

                if (dist <= proximity) {
                    // Arrived within range
                    if (state.queuedAction.actionType === 'openAdmin') {
                        showAdminModal();
                    }
                    state.queuedAction = null;
                    // Stop movement if we just arrived? 
                    // Optional: forceMove(pos.x, pos.y) to stop, but might be jarring.
                    // Let it finish the path or just execute interaction.
                } else if (!getIsMoving()) {
                    // Not moving and still far - failed to reach
                    state.queuedAction = null;
                }
            } else {
                state.queuedAction = null;
            }
        }

        // Update debug HUD
        const cam = getCamera();
        state.debug.lastPathResult = lastPathResult ?? null;
        updateDebugHud({
            pos: pos,
            target: getTarget(),
            camera: cam,
            dt: deltaMs,
            isMoving: getIsMoving(),
            lastTickMoveAt: now,
            lastRenderAt: now,
            lastClickWorld: clickMarker,
            canMoveTo: debug.canMoveTo,
            pathReason: state.debug.lastPathResult?.reason
        });

        animationFrameId = requestAnimationFrame(gameLoop);
    }

    animationFrameId = requestAnimationFrame(gameLoop);
}

// ========== Helpers ==========
function updateDrawerUI() {
    const overlay = document.getElementById('drawer-overlay');
    const drawer = document.getElementById('drawer');
    const title = document.getElementById('drawer-title');

    const isOpen = state.ui.drawer !== 'none';

    overlay.classList.toggle('visible', isOpen);
    drawer.classList.toggle('open', isOpen);

    // Hide all drawer content
    document.querySelectorAll('[id^="drawer-"]').forEach(el => {
        if (el.id !== 'drawer-overlay' && el.id !== 'drawer' && el.id !== 'drawer-title' && el.id !== 'drawer-close') {
            el.classList.add('hidden');
        }
    });

    // Show active drawer content
    if (state.ui.drawer !== 'none') {
        const content = document.getElementById(`drawer-${state.ui.drawer}`);
        if (content) content.classList.remove('hidden');

        const titles = {
            chat: 'Chat',
            people: 'People',
            search: 'Search',
            settings: 'Settings'
        };
        title.textContent = titles[state.ui.drawer] || 'Drawer';
    }

    setChatDrawerOpen(state.ui.drawer === 'chat');

    // Close button
    document.getElementById('drawer-close')?.addEventListener('click', () => {
        closeDrawer();
    });

    overlay.addEventListener('click', () => {
        closeDrawer();
    });
}

function handleEvent(event) {
    const { type, payload, fromActorId, fromDisplayName } = event;

    // Handle call events
    if (type.startsWith('call_')) {
        handleCallEvent(event);
        return;
    }

    // Handle poke
    if (type === 'poke') {
        const sender = getPeople().get(fromActorId);
        showPokeToast(sender?.displayName || fromDisplayName || 'Someone');
    }
}

/**
 * Handle action spot interactions
 * @param {object} action - The spot action configuration
 */
function handleSpotAction(action, spot) {
    if (!action || !action.type) return;

    switch (action.type) {
        case 'openToolLinks':
            // Use contentLoader gallery data instead of action.links
            const gallery = getGallery();
            const links = gallery?.items?.map(item => ({
                label: item.title,
                url: item.url,
                desc: item.desc
            })) || action.links || [];
            showToolLinksModal(action.title || 'Tools', links);
            break;
        case 'openBulletin':
            // Use contentLoader news data
            const news = getNews();
            showBulletinModal(action.title || 'Bulletin', news?.items || []);
            break;
        case 'openBgmSelector': {
            if (state.world.areaId !== 'area:garden') {
                console.log('[BGM] ignored openBgmSelector outside garden', { areaId: state.world.areaId });
                return;
            }
            const stored = localStorage.getItem('bgm:garden:selected');
            const selectedId = stored && stored.length ? stored : DEFAULT_GARDEN_BGM_ID;
            showBgmModal({ tracks: resolveGardenTracksSafe(), selectedId, title: 'Garden BGM' });
            break;
        }
        case 'openAmbientParticles':
            showAmbientModal();
            break;
        case 'openProfileEditor':
            openProfileEditor();
            break;
        case 'openDirectorySearch':
            openDirectorySearch();
            break;
        case 'openRecentUpdates':
            openRecentUpdates();
            break;
        case 'openProfileViewer':
            openProfileViewer();
            break;
        case 'openAdmin':
            // Proximity check
            const proximity = spot?.proximity || 90;
            const avatarPos = getCurrentPos();

            // Calculate distance to interact point (preferred) or center
            let targetX, targetY;

            if (spot.interactPoint) {
                targetX = spot.interactPoint.x;
                targetY = spot.interactPoint.y;
            } else if (spot.bounds) {
                targetX = spot.bounds.x + spot.bounds.w / 2;
                targetY = spot.bounds.y + spot.bounds.h / 2;
            } else {
                targetX = spot.x || 320;
                targetY = spot.y || 85;
            }

            const dx = avatarPos.x - targetX;
            const dy = avatarPos.y - targetY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= proximity) {
                showAdminModal();
            } else {
                // Auto-approach
                console.log('[Main] Admin spot far, auto-approaching...', distance);
                setMoveTarget(targetX, targetY);
                state.queuedAction = {
                    spotId: spot.id,
                    actionType: action.type
                };
            }
            break;
        case 'cycleTimeMode':
            if (state.world.areaId !== 'area:garden') {
                console.log('[Temizu] ignored cycleTimeMode outside garden', { areaId: state.world.areaId });
                return;
            }
            {
                const areaId = state.world.areaId;
                const prev = state.ui.timeMode || 'day';
                const next = nextTimeOfDay(prev);
                state.ui.timeMode = next;
                setTimeMode(next);
                console.log('[Temizu] cycleTimeMode', { areaId, prev, next });
                showToast(`Time: ${getTimePreset(next).label.toLowerCase()}`, 'success');
            }
            break;
        default:
            console.log('[Main] Unknown spot action type:', action.type);
    }
}

async function sendPoke(targetActorId) {
    await sendEventTo(targetActorId, {
        type: 'poke',
        payload: {},
        fromActorId: state.me.actorId,
        fromDisplayName: state.me.displayName
    });
}

export async function setupNameplate() {
    // Check for existing nameplate
    const existingNameplate = await getNameplateBySessionId(state.me.actorId);
    const savedName = getDisplayName();

    if (existingNameplate) {
        state.me.displayName = existingNameplate.display_name;
        updateDisplayName(existingNameplate.display_name);
        setDisplayNameInput(existingNameplate.display_name);
        return true;
    }

    if (savedName) {
        // Try to use saved name
        const taken = await isDisplayNameTaken(savedName, state.me.actorId);
        if (!taken) {
            await upsertNameplate({
                sessionId: state.me.actorId,
                displayName: savedName
            });
            state.me.displayName = savedName;
            updateDisplayName(savedName);
            setDisplayNameInput(savedName);
            return true;
        }
    }

    // Need to show nameplate modal
    return false;
}

export async function saveNameplate(displayName) {
    let didHitDuplicate = false;

    try {
        await upsertNameplate({
            sessionId: state.me.actorId,
            displayName: displayName
        });
    } catch (err) {
        const message = typeof err?.message === 'string' ? err.message : '';
        const isDuplicate = err?.code === '23505' || message.includes('duplicate') || message.includes('unique');
        if (isDuplicate) {
            didHitDuplicate = true;
            console.warn('[Nameplate] Duplicate detected; continuing without blocking boot.', err);
        } else {
            throw err;
        }
    }

    state.me.displayName = displayName;
    setDisplayName(displayName);
    updateDisplayName(displayName);
    setDisplayNameInput(displayName);

    if (didHitDuplicate) {
        console.warn('[Nameplate] Duplicate prevented remote save; local name retained.');
    }
}

export async function startPresence() {
    const pos = getCurrentPos();

    await joinPresence({
        presenceChannelKey: 'presence:office',
        initialState: {
            actorId: state.me.actorId,
            displayName: state.me.displayName,
            status: state.me.status,
            pos: pos,
            facing: getFacing(),
            avatarColor: state.me.avatar.color,
            location: getLocationLabel(state.world.insideSpotId, state.world.seatedDeskId, state.world.areaId)
        }
    });
}

export function getMe() {
    return state.me;
}

export function getState() {
    return state;
}
