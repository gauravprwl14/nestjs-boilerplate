/** Valid status transitions. Key = from status, Value = allowed "to" statuses */
export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['IN_PROGRESS', 'ARCHIVED'],
  IN_PROGRESS: ['PENDING', 'COMPLETED'],
  COMPLETED: ['IN_PROGRESS', 'ARCHIVED'],
  ARCHIVED: [], // terminal — no transitions out
};
