// modal.incomingCall.js - Incoming call modal

let onAccept = null;
let onReject = null;

export function initIncomingCallModal({ acceptCallback, rejectCallback }) {
    onAccept = acceptCallback;
    onReject = rejectCallback;

    const acceptBtn = document.getElementById('call-accept');
    const rejectBtn = document.getElementById('call-reject');

    acceptBtn?.addEventListener('click', () => {
        if (onAccept) onAccept();
        hideIncomingCallModal();
    });

    rejectBtn?.addEventListener('click', () => {
        if (onReject) onReject();
        hideIncomingCallModal();
    });
}

export function showIncomingCallModal(callerName) {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal-incoming-call');
    const passwordModal = document.getElementById('modal-password');
    const nameplateModal = document.getElementById('modal-nameplate');

    // Hide other modals
    passwordModal?.classList.add('hidden');
    nameplateModal?.classList.add('hidden');

    // Show incoming call modal
    modal.classList.remove('hidden');
    overlay.classList.add('visible');

    // Update caller name
    const fromEl = document.getElementById('incoming-call-from');
    if (fromEl) {
        fromEl.textContent = `${callerName} からの着信`;
    }
}

export function hideIncomingCallModal() {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal-incoming-call');

    modal.classList.add('hidden');

    // Only hide overlay if no other modal is visible
    const passwordModal = document.getElementById('modal-password');
    const nameplateModal = document.getElementById('modal-nameplate');

    if (passwordModal?.classList.contains('hidden') &&
        nameplateModal?.classList.contains('hidden')) {
        overlay.classList.remove('visible');
    }
}
