// main.js - Main application state and logic

import { loadMaps, getSpawnPoint, getSpotById } from './world/mapLoader.js';
import { initRenderer, render, updateCamera, renderMinimap, screenToWorld, getCamera, applyZoom } from './world/mapRenderer.js';
import { initMovement, updateMovement, setMoveTarget, getCurrentPos, getFacing, teleportTo, getTarget, getIsMoving, forceMove, lastPathResult } from './world/movement.js';
import { canMoveTo, canMoveToDebug } from './world/collision.js';
import { getSpotAt, getNearbyDesk, getClickableAt, getLocationLabel } from './world/spotLogic.js';
import { warpNearUser } from './world/warp.js';
import { initDebugHud, updateDebugHud } from './ui/debugHud.js';
import { updateAnimation } from './avatar/pixelSpriteRenderer.js';

import { getConfig, getSupabase } from './services/supabaseClient.js';
import { upsertNameplate, isDisplayNameTaken, getNameplateBySessionId } from './services/db.js';
import { initRealtime, joinPresence, updatePresence, subscribeEvents, sendEventTo, subscribeChat, sendChat, shutdownRealtime } from './services/realtime.js';

import { initMenubar, openDrawer, closeDrawer, updateDisplayName, updateStatus } from './ui/menubar.js';
import { showToast, showPokeToast } from './ui/toast.js';
import { initChatDrawer, addMessage } from './ui/drawer.chat.js';
import { initPeopleDrawer, updatePeople, getPeople } from './ui/drawer.people.js';
import { initSearchDrawer, refreshSearch } from './ui/drawer.search.js';
import { initSettingsDrawer, applyTheme, setDisplayNameInput, setActiveStatus, setActiveTheme } from './ui/drawer.settings.js';
import { initPasswordModal, showPasswordModal, hidePasswordModal } from './ui/modal.password.js';
import { initNameplateModal, showNameplateModal, hideNameplateModal, showNameplateError } from './ui/modal.nameplate.js';
import { initIncomingCallModal, showIncomingCallModal, hideIncomingCallModal } from './ui/modal.incomingCall.js';
import { initContextPanel, showContextPanel, hideContextPanel, loadRoomSettings } from './ui/panel.context.js';
import { initSpotModal, showToolLinksModal, showBulletinModal, hideSpotModal, isSpotModalVisible } from './ui/modal.spot.js';
import { initAdminModal, showAdminModal, hideAdminModal, isAdminModalVisible } from './ui/modal.admin.js';
import { loadGallery, loadNews, getGallery, getNews } from './data/contentLoader.js';

import { initChatLogic, updateRoomChannel, sendChatMessage, addDmChannel } from './chat/chatLogic.js';
import { initCallStateMachine, getCallState } from './call/callStateMachine.js';
import { initSignaling, startCall, acceptIncomingCall, hangUp, handleCallEvent } from './call/signaling.js';
import { initWebRTC } from './call/webrtc.js';

import { getSessionId, setSessionId, getSavedPassword, setSavedPassword, clearSavedPassword, getDisplayName, setDisplayName, getThemeId } from './utils/storage.js';
import { generateSessionId } from './utils/ids.js';

// ========== Application State ==========
const state = {
    ui: {
        drawer: 'none',
        chatTab: 'all',
        selected: null,
        modal: 'none',
        themeId: 'theme:day',
        toastQueue: []
    },
    world: {
        areaId: 'area:core',
        pos: { x: 260, y: 260 },
        facing: 'down',
        seatedDeskId: null,
        insideSpotId: null
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
    }
};

let lastFrameTime = 0;
let lastActivityTime = Date.now();
let animationFrameId = null;
let config = null;

// Debug object for coordinate verification
const debug = {
    lastClick: null,
    lastWorldPos: null,
    canMoveTo: null
};

// ========== Initialization ==========
export async function initApp(appConfig, session) {
    config = appConfig;

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

    // Load maps
    await loadMaps();

    // Load room settings
    await loadRoomSettings();

    // Initialize renderer
    const canvas = document.getElementById('map-canvas');
    await initRenderer(canvas);

    // Initialize debug HUD (development only)
    initDebugHud();

    // Set spawn position
    const spawn = getSpawnPoint('lobby');
    state.world.pos = { ...spawn };

    // Initialize movement
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
            updateRoomChannel(state.world.insideSpotId, state.world.seatedDeskId, state.world.areaId);
            // Note: Action spots are handled via click, not walk-in
        }
    });

    // Initialize UI modules
    initMenubar((drawer) => {
        state.ui.drawer = drawer;
        updateDrawerUI();
    });

    initChatDrawer((tab, text) => {
        sendChatMessage(tab, text);

        // Add to local display
        addMessage(tab, {
            from: state.me.displayName,
            text: text,
            timestamp: Date.now(),
            fromMe: true
        });
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
        dmCallback: (person) => {
            addDmChannel(person.actorId);
            state.ui.chatTab = 'dm';
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

    initContextPanel({
        openZoom: (url) => {
            window.open(url, '_blank');
        },
        openRoomChat: (spotId) => {
            openDrawer('chat');
        },
        sit: (desk) => {
            state.world.seatedDeskId = desk.id;
            teleportTo(desk.standPoint.x, desk.standPoint.y);
            updateRoomChannel(state.world.insideSpotId, state.world.seatedDeskId, state.world.areaId);
            hideContextPanel();
        },
        stand: () => {
            state.world.seatedDeskId = null;
            updateRoomChannel(state.world.insideSpotId, null, state.world.areaId);
            hideContextPanel();
        },
        poke: (person) => {
            sendPoke(person.actorId);
            showToast(`Poked ${person.displayName}`);
        },
        dm: (person) => {
            addDmChannel(person.actorId);
            openDrawer('chat');
        },
        call: (person) => {
            startCall(person.actorId);
        }
    });

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
    initAdminModal();

    // Load dynamic content
    loadGallery();
    loadNews();

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

    // Initialize chat logic
    initChatLogic({
        actorId: state.me.actorId,
        displayName: state.me.displayName
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
        },
        onChat: (msg) => {
            if (msg.fromActorId !== state.me.actorId) {
                addMessage(msg.channel, {
                    from: msg.fromDisplayName || 'Unknown',
                    text: msg.text,
                    timestamp: msg.timestamp,
                    fromMe: false
                });
            }
        }
    });

    // Subscribe to events
    subscribeEvents({ myActorId: state.me.actorId });

    // Subscribe to chat
    subscribeChat({ all: true, room: null, dmList: [] });

    // Helper: Check if click is on UI element
    function isUiClick(target) {
        return target.closest('#menubar, #drawer, #modal-overlay, #context-panel, #minimap, button, input, textarea, a, .toast');
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

        // Prevent default to avoid scroll/zoom on touch
        e.preventDefault();

        lastActivityTime = Date.now();

        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        const worldPos = screenToWorld(screenX, screenY);

        // Debug: Track click coordinates for verification
        const moveDebug = canMoveToDebug(worldPos.x, worldPos.y);
        debug.lastClick = {
            screen: { x: Math.round(screenX), y: Math.round(screenY) },
            world: { x: Math.round(worldPos.x), y: Math.round(worldPos.y) },
            time: Date.now()
        };
        debug.lastWorldPos = worldPos;
        debug.canMoveTo = moveDebug.ok;
        debug.moveReason = moveDebug.reason;

        console.log('[Click]', {
            screen: debug.lastClick.screen,
            world: debug.lastClick.world,
            canMoveTo: moveDebug,
            camera: getCamera()
        });

        // Check if clicked on a clickable element (spot, desk, user)
        const clickable = getClickableAt(worldPos.x, worldPos.y);

        if (clickable.kind === 'spot' && clickable.data?.action) {
            // Action spot (gallery, bulletin, admin) - show modal
            handleSpotAction(clickable.data.action, clickable.data);
        } else if (clickable.kind) {
            // Other clickable (zoom room, desk) - show context panel
            state.ui.selected = clickable;
            showContextPanel(clickable);
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

    // Keyboard handler
    const keys = { up: false, down: false, left: false, right: false, w: false, a: false, s: false, d: false };

    document.addEventListener('keydown', (e) => {
        lastActivityTime = Date.now();

        if (e.key === 'ArrowUp') keys.up = true;
        if (e.key === 'ArrowDown') keys.down = true;
        if (e.key === 'ArrowLeft') keys.left = true;
        if (e.key === 'ArrowRight') keys.right = true;
        if (e.key.toLowerCase() === 'w') keys.w = true;
        if (e.key.toLowerCase() === 'a') keys.a = true;
        if (e.key.toLowerCase() === 's') keys.s = true;
        if (e.key.toLowerCase() === 'd') keys.d = true;

        // Debug keys
        if (e.key.toLowerCase() === 'g') {
            // G: Force set move target +200 right
            const p = getCurrentPos();
            console.log('[DEBUG] G pressed, setting target +200 right');
            setMoveTarget(p.x + 200, p.y);
        }
        if (e.key.toLowerCase() === 'h') {
            // H: Force move position +50 right
            console.log('[DEBUG] H pressed, force moving +50 right');
            forceMove(50, 0);
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

        // Render
        const otherPlayers = Array.from(state.rt.people.values()).map(p => ({
            pos: p.pos || { x: 0, y: 0 },
            displayName: p.displayName || 'Unknown',
            status: p.status || 'online',
            avatarColor: p.avatarColor,
            actorId: p.actorId
        }));

        render(pos, getFacing(), otherPlayers, state.me, clickMarker, clickMarkerTime, deltaMs);

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
            pathReason: lastPathResult?.reason
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
    // Check for duplicate
    const taken = await isDisplayNameTaken(displayName, state.me.actorId);
    if (taken) {
        throw new Error('duplicate');
    }

    await upsertNameplate({
        sessionId: state.me.actorId,
        displayName: displayName
    });

    state.me.displayName = displayName;
    setDisplayName(displayName);
    updateDisplayName(displayName);
    setDisplayNameInput(displayName);
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
