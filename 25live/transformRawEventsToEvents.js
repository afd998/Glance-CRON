const {
  generateDeterministicId,
  getEventType,
  getOrganization,
  getInstructorNames,
  getLectureTitle,
  parseRoomName,
  parseEventResources,
  toTimeStrings,
} = require("./utils");

/**
 * Combine KEC events that occur on the same day in the same room into single events
 * @param {Array} events - Array of processed events
 * @returns {Array} Array with KEC events combined and other events unchanged
 */

function removeKECNoAcademicEvents(events) {
  return events.filter((event) => {
    if (event.event_type !== "KEC") {
      return true;
    }
    console.log(event.raw.itemDetails?.defn?.panel[1]?.item?.[0]?.itemName);
    return (
      event.raw.itemDetails?.defn?.panel[1]?.item?.[0]?.itemName ===
        "<p>Academic Session</p>" ||
      event.raw.itemDetails?.defn?.panel[1]?.item?.[0]?.itemName ===
        "<p>Class Session</p>"
    );
  });
}

function combineKECEvents(events) {
  console.log(`Combining KEC events by day and room...`);

  // Separate KEC events from other events
  const kecEvents = events.filter((event) => event.event_type === "KEC");
  const nonKecEvents = events.filter((event) => event.event_type !== "KEC");

  if (kecEvents.length === 0) {
    console.log("No KEC events found to combine");
    return events;
  }

  console.log(`Found ${kecEvents.length} KEC events to potentially combine`);

  // Group KEC events by date and room
  const kecGroups = kecEvents.reduce((groups, event) => {
    const key = `${event.date}_${event.room_name}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(event);
    return groups;
  }, {});

  const combinedKecEvents = [];
  let combineCount = 0;

  Object.entries(kecGroups).forEach(([key, eventGroup]) => {
    if (eventGroup.length === 1) {
      // Only one KEC event for this day/room, keep as is
      combinedKecEvents.push(eventGroup[0]);
      return;
    }

    // Multiple KEC events for this day/room - combine them
    console.log(`Combining ${eventGroup.length} KEC events for ${key}`);

    // Find earliest start time and latest end time
    let earliestStart = eventGroup[0].start_time;
    let latestEnd = eventGroup[0].end_time;

    eventGroup.forEach((event) => {
      if (event.start_time < earliestStart) {
        earliestStart = event.start_time;
      }
      if (event.end_time > latestEnd) {
        latestEnd = event.end_time;
      }
    });

    // Create combined event using the first event as template
    const combinedEvent = {
      ...eventGroup[0],
      start_time: earliestStart,
      end_time: latestEnd,
      instructor_names: null, // No instructor names for combined KEC events
      resources: [], // No resources for combined KEC events
      // Keep the same event_name (assuming all have same name as requested)
      // Use the first event's ID but we could generate a new one if needed
    };

    combinedKecEvents.push(combinedEvent);
    combineCount++;

    console.log(
      `Combined KEC event: ${combinedEvent.event_name} in ${combinedEvent.room_name} from ${earliestStart} to ${latestEnd}`
    );
  });

  console.log(`Combined ${combineCount} groups of KEC events`);

  // Return combined KEC events plus all non-KEC events
  return [...combinedKecEvents, ...nonKecEvents];
}

/**
 * Merge events from adjacent rooms that have the same event name and start time
 * Handles: 1420 & 1430 -> 1420&30, 2410A & 2410B -> 2410A&B, 2420A & 2420B -> 2420A&B, and 2430A & 2430B -> 2430A&B
 * @param {Array} events - Array of processed events
 * @returns {Array} Array with merged events
 */
function mergeAdjacentRoomEvents(events) {
  console.log(
    `Merging adjacent room events (1420 & 1430, 2410A & 2410B, 2420A & 2420B, 2430A & 2430B)...`
  );

  // Group events by date, event_name, and start_time to find potential matches
  const eventGroups = events.reduce((groups, event) => {
    const key = `${event.date}_${event.event_name}_${event.start_time}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(event);
    return groups;
  }, {});

  const mergedEvents = [];
  let mergeCount1420 = 0;
  let mergeCount2410 = 0;
  let mergeCount2420 = 0;
  let mergeCount2430 = 0;

  Object.values(eventGroups).forEach((eventGroup) => {
    if (eventGroup.length === 1) {
      // No potential matches, keep the event as is
      mergedEvents.push(eventGroup[0]);
      return;
    }

    // Look for 1420 and 1430 room pairs
    const room1420 = eventGroup.find((e) => e.room_name === "GH 1420");
    const room1430 = eventGroup.find((e) => e.room_name === "GH 1430");

    // Look for 2410A and 2410B room pairs
    const room2410A = eventGroup.find((e) => e.room_name === "GH 2410A");
    const room2410B = eventGroup.find((e) => e.room_name === "GH 2410B");

    // Look for 2420A and 2420B room pairs
    const room2420A = eventGroup.find((e) => e.room_name === "GH 2420A");
    const room2420B = eventGroup.find((e) => e.room_name === "GH 2420B");

    // Look for 2430A and 2430B room pairs
    const room2430A = eventGroup.find((e) => e.room_name === "GH 2430A");
    const room2430B = eventGroup.find((e) => e.room_name === "GH 2430B");

    let processedEvents = new Set(); // Track which events we've already processed

    if (room1420 && room1430) {
      // Found a 1420/1430 pair! Merge them
      const mergedEvent = {
        ...room1420,
        room_name: "GH 1420&30",
      };
      mergedEvents.push(mergedEvent);
      mergeCount1420++;
      processedEvents.add(room1420);
      processedEvents.add(room1430);
    }

    if (room2410A && room2410B) {
      // Found a 2410A/2410B pair! Merge them
      const mergedEvent = {
        ...room2410A,
        room_name: "GH 2410A&B",
      };
      mergedEvents.push(mergedEvent);
      mergeCount2410++;
      console.log(
        "Merged 2410A&B event:",
        mergedEvent.event_name,
        mergedEvent.event_type
      );
      processedEvents.add(room2410A);
      processedEvents.add(room2410B);
    } else if (room2410A || room2410B) {
      // Only one room has an event - log this for debugging
      const singleEvent = room2410A || room2410B;
      console.log(
        "Single room 2410 event (not merged):",
        singleEvent.event_name,
        singleEvent.event_type,
        singleEvent.room_name
      );
    }

    if (room2420A && room2420B) {
      // Found a 2420A/2420B pair! Merge them
      const mergedEvent = {
        ...room2420A,
        room_name: "GH 2420A&B",
      };
      mergedEvents.push(mergedEvent);
      mergeCount2420++;
      processedEvents.add(room2420A);
      processedEvents.add(room2420B);
    }

    if (room2430A && room2430B) {
      // Found a 2430A/2430B pair! Merge them
      const mergedEvent = {
        ...room2430A,
        room_name: "GH 2430A&B",
      };
      mergedEvents.push(mergedEvent);
      mergeCount2430++;
      processedEvents.add(room2430A);
      processedEvents.add(room2430B);
    }

    // Add any other events in this group that weren't processed in merging
    eventGroup.forEach((event) => {
      if (!processedEvents.has(event)) {
        mergedEvents.push(event);
      }
    });
  });

  console.log(
    `Merged ${mergeCount1420} pairs of 1420/1430 events, ${mergeCount2410} pairs of 2410A/2410B events, ${mergeCount2420} pairs of 2420A/2420B events, and ${mergeCount2430} pairs of 2430A/2430B events`
  );
  return mergedEvents;
}

// Process the raw event data to extract and add processed properties
function transformRawEventsToEvents(rawData) {
  // Handle case where rawData is undefined (no events)
  if (!rawData || !Array.isArray(rawData)) {
    console.log("No events to process");
    return [];
  }

  console.log(
    `Processing ${rawData.length} events to extract additional properties...`
  );

  // Filter out events where itemId or itemId2 equals 0, or subject_itemName contains ampersand
  // BUT only filter itemId=0 if the event name is "(Private)" - we want to keep real events that happen to have itemId=0
  const filteredData = rawData.filter((event) => {
    const isPrivateEvent =
      event.itemId === 0 &&
      (event.itemName === "(Private)" || event.itemName === "Closed");
    return (
      !isPrivateEvent &&
      event.itemId2 !== 0 &&
      !event.subject_itemName?.includes("&")
    );
  });

  console.log(
    `Filtered out ${
      rawData.length - filteredData.length
    } events with itemId/itemId2 equal to 0 or containing ampersand in room name`
  );

  // First, process all events with room parsing
  const processedEvents = filteredData.map((event) => {
    const { startTimeStr, endTimeStr } = toTimeStrings(event.start, event.end);

    // Extract just the date part from subject_item_date (YYYY-MM-DD format)
    const eventDate = event.subject_item_date
      ? event.subject_item_date.split("T")[0]
      : new Date().toISOString().split("T")[0];

    return {
      item_id: event.itemId,
      item_id2: event.itemId2,
      // Generate a deterministic ID from the source data for upsert operations
      id: generateDeterministicId(
        event.itemId,
        event.itemId2,
        event.subject_itemId
      ),
      date: eventDate,
      start_time: startTimeStr,
      end_time: endTimeStr,
      event_name: event.itemName,
      event_type: getEventType(event),
      organization: getOrganization(event),
      instructor_names: getInstructorNames(event),
      lecture_title: getLectureTitle(event),
      room_name: parseRoomName(event.subject_itemName),
      resources: parseEventResources(event),
      updated_at: new Date().toISOString(),
      raw: event,
    };
  });

  // Now merge adjacent room events (1420 & 1430)
  const mergedEvents = mergeAdjacentRoomEvents(processedEvents);
  const filteredEvents = removeKECNoAcademicEvents(mergedEvents);
  return filteredEvents;
}

module.exports = {
  transformRawEventsToEvents,
  getEventType,
  getOrganization,
  getInstructorNames,
  getLectureTitle,
  parseRoomName,
  parseEventResources,
  generateDeterministicId,
  combineKECEvents,
  mergeAdjacentRoomEvents,
};
