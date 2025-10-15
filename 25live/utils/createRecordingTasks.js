const THIRTY_MINUTES_IN_SECONDS = 30 * 60;

/**
 * Convert a HH:MM[:SS] string into seconds from midnight.
 * @param {string} timeStr
 * @returns {number|null}
 */
const parseTimeToSeconds = (timeStr) => {
  if (typeof timeStr !== 'string') {
    return null;
  }

  const parts = timeStr.split(':').map(part => Number(part));

  if (parts.some(Number.isNaN)) {
    return null;
  }

  const [hours = 0, minutes = 0, seconds = 0] = parts;

  return (hours * 3600) + (minutes * 60) + Math.floor(seconds);
};

/**
 * Convert seconds from midnight into a HH:MM:SS string.
 * @param {number} totalSeconds
 * @returns {string}
 */
const formatSecondsToTime = (totalSeconds) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0'),
  ].join(':');
};

/**
 * Create Panopto recording check tasks for events with video recording resources.
 * Mirrors the behaviour of the SQL trigger by emitting 30 minute interval checks.
 * @param {Object} event
 * @param {Object} resource
 * @returns {Array<Object>}
 */
function createRecordingTasks(event, resource) {
  if (!event || !resource) {
    return [];
  }

  const resourceName = resource.itemName || '';
  const hasVideoRecordingResource = resourceName
    .toUpperCase()
    .startsWith('KSM-KGH-VIDEO-RECORDING');

  if (!hasVideoRecordingResource) {
    return [];
  }

  const startSeconds = parseTimeToSeconds(event.start_time);
  const endSeconds = parseTimeToSeconds(event.end_time);

  if (startSeconds === null || endSeconds === null) {
    return [];
  }

  const durationSeconds = endSeconds - startSeconds;
  if (durationSeconds <= 0) {
    return [];
  }

  const totalChecks = Math.floor(durationSeconds / THIRTY_MINUTES_IN_SECONDS);
  if (totalChecks <= 0) {
    return [];
  }

  const tasks = [];
  for (let index = 0; index < totalChecks; index += 1) {
    const checkSeconds = startSeconds + (index * THIRTY_MINUTES_IN_SECONDS);

    tasks.push({
      event_id: event.id,
      taskType: 'RECORDING CHECK',
      resource_item_name: resourceName,
      date: event.date,
      time: formatSecondsToTime(checkSeconds),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return tasks;
}

module.exports = {
  createRecordingTasks,
};
