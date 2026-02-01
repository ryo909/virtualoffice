// chatLogic.js - Chat channel management

import { sendChat, subscribeChat } from '../services/realtime.js';
import { normalizeDmChannel, generateMessageId } from '../utils/ids.js';
import { getRoomChatChannel } from '../world/spotLogic.js';

let currentRoomChannel = null;
let currentDmChannels = [];
let myActorId = null;
let myDisplayName = null;

export function initChatLogic({ actorId, displayName }) {
    myActorId = actorId;
    myDisplayName = displayName;
}

export function updateRoomChannel(insideSpotId, seatedDeskId, areaId) {
    const newChannel = getRoomChatChannel(insideSpotId, seatedDeskId, areaId);

    if (newChannel !== currentRoomChannel) {
        currentRoomChannel = newChannel;
        resubscribeChat();
    }
}

export function addDmChannel(targetActorId) {
    const channel = normalizeDmChannel(myActorId, targetActorId);

    if (!currentDmChannels.includes(channel)) {
        currentDmChannels.push(channel);
        resubscribeChat();
    }

    return channel;
}

function resubscribeChat() {
    subscribeChat({
        all: true,
        room: currentRoomChannel?.replace('chat:room:', '').replace('chat:desk:', ''),
        dmList: currentDmChannels
    });
}

export async function sendChatMessage(tab, text) {
    let channel = 'chat:all';

    if (tab === 'room' && currentRoomChannel) {
        channel = currentRoomChannel;
    } else if (tab === 'dm' && currentDmChannels.length > 0) {
        // Use the most recent DM channel
        channel = currentDmChannels[currentDmChannels.length - 1];
    }

    await sendChat(channel, text, {
        messageId: generateMessageId(),
        fromActorId: myActorId,
        fromDisplayName: myDisplayName
    });
}

export function getCurrentRoomChannel() {
    return currentRoomChannel;
}
