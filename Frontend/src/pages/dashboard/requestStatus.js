export function getRequestStatusMeta(request) {
  if (request?.status === 'completed' || !request?.currentStep) {
    return {
      isCompleted: true,
      banner: 'Verification Completed',
      message: 'Your verification request has been completed.',
    };
  }

  if (request?.status === 'rejected') {
    return {
      isCompleted: false,
      banner: 'Verification Rejected',
      message: 'Your verification request has been rejected.',
    };
  }

  return {
    isCompleted: false,
    banner: '',
    message: '',
  };
}
