const { createRecordingTasks } = require('./utils/createRecordingTasks');
function transformEventsToTasks(events) {
    return events.map(event => {
        event.resources.map(resource => {
            const lowercaseItemName = resource.itemName.toLowerCase();
            if (lowercaseItemName.includes('recording')) {
                return createRecordingTasks(event, resource);
            }
        });
    });
}

module.exports = {
            transformEventsToTasks,
        };
