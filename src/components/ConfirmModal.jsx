import Modal, { ModalActions, Btn } from './Modal.jsx';

// Native confirm() is silently blocked in some browsers/webviews (in-app
// browsers, some Android WebViews) - it just returns false with no prompt
// shown, so the action quietly does nothing. Use this instead everywhere a
// destructive action needs a "are you sure" step.
export default function ConfirmModal({ open, title = 'Are you sure?', message, confirmLabel = 'Yes, Continue', onConfirm, onCancel }) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-ink -mt-1 mb-1">{message}</p>
      <ModalActions>
        <Btn variant="danger" onClick={onConfirm}>{confirmLabel}</Btn>
        <Btn type="button" onClick={onCancel}>Cancel</Btn>
      </ModalActions>
    </Modal>
  );
}
