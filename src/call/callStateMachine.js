// callStateMachine.js - Call state management

/**
 * Call states:
 * - idle: No call
 * - requesting: Outgoing call request sent
 * - incoming: Incoming call received
 * - connecting: Call accepted, establishing connection
 * - in_call: Active call
 * - error: Call failed
 */

let state = {
    state: 'idle',
    peerActorId: null,
    callId: null,
    lastError: null
};

let onStateChange = null;

export function initCallStateMachine(callback) {
    onStateChange = callback;
}

export function getCallState() {
    return { ...state };
}

export function transitionTo(newState, data = {}) {
    const prevState = state.state;

    state = {
        state: newState,
        peerActorId: data.peerActorId || null,
        callId: data.callId || null,
        lastError: data.error || null
    };

    console.log(`Call state: ${prevState} -> ${newState}`, state);

    if (onStateChange) {
        onStateChange(state, prevState);
    }
}

export function requestCall(peerActorId, callId) {
    if (state.state !== 'idle') {
        console.warn('Cannot request call, not in idle state');
        return false;
    }

    transitionTo('requesting', { peerActorId, callId });
    return true;
}

export function receiveIncomingCall(peerActorId, callId) {
    if (state.state !== 'idle') {
        console.warn('Cannot receive call, not in idle state');
        return false;
    }

    transitionTo('incoming', { peerActorId, callId });
    return true;
}

export function acceptCall() {
    if (state.state !== 'incoming') {
        console.warn('Cannot accept call, not in incoming state');
        return false;
    }

    transitionTo('connecting', {
        peerActorId: state.peerActorId,
        callId: state.callId
    });
    return true;
}

export function rejectCall() {
    if (state.state !== 'incoming') {
        console.warn('Cannot reject call, not in incoming state');
        return false;
    }

    transitionTo('idle');
    return true;
}

export function callConnected() {
    if (state.state !== 'connecting' && state.state !== 'requesting') {
        console.warn('Cannot connect call, not in connecting/requesting state');
        return false;
    }

    transitionTo('in_call', {
        peerActorId: state.peerActorId,
        callId: state.callId
    });
    return true;
}

export function endCall() {
    transitionTo('idle');
    return true;
}

export function callError(error) {
    transitionTo('error', { error });

    // Auto-reset to idle after error
    setTimeout(() => {
        if (state.state === 'error') {
            transitionTo('idle');
        }
    }, 3000);
}

export function isInCall() {
    return state.state === 'in_call';
}

export function isBusy() {
    return state.state !== 'idle';
}
