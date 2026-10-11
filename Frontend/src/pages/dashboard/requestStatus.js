export function getRequestStatusMeta(request) {
  if (request?.status === 'rejected') {
    return {
      isCompleted: false,
      isTerminal: true,
      banner: 'Verification Rejected',
      message: 'Your verification request has been rejected.',
    };
  }

  if (request?.status === 'cancelled') {
    return {
      isCompleted: false,
      isTerminal: true,
      banner: 'Verification Cancelled',
      message: 'This verification request was cancelled and cannot accept more evidence.',
    };
  }

  if (request?.status === 'completed' || (!request?.currentStep && request?.status !== 'pending')) {
    return {
      isCompleted: true,
      isTerminal: true,
      banner: 'Verification Completed',
      message: 'Your verification request has been completed.',
    };
  }

  return {
    isCompleted: false,
    isTerminal: false,
    banner: '',
    message: '',
  };
}
