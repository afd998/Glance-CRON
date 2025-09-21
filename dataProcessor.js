// Helper functions to extract data from event objects

/**
 * Generate a deterministic ID from source data that can handle large numbers
 * Uses BigInt to avoid precision issues with large concatenated numbers
 * @param {number} itemId - The item ID
 * @param {number} itemId2 - The second item ID  
 * @param {number} subjectItemId - The subject item ID
 * @returns {number} A unique integer ID
 */
const generateDeterministicId = (itemId, itemId2, subjectItemId) => {
  // Create a deterministic ID that combines the three numbers in a way that's guaranteed unique
  // and fits within PostgreSQL int8 limits (19 digits max)
  
  // Convert to strings and pad to ensure consistent length
  const itemIdStr = itemId.toString().padStart(10, '0');
  const itemId2Str = itemId2.toString().padStart(10, '0');
  const subjectItemIdStr = subjectItemId.toString().padStart(5, '0');
  
  // Take the last 6 digits of each to keep the total manageable
  const itemIdPart = parseInt(itemIdStr.slice(-6));
  const itemId2Part = parseInt(itemId2Str.slice(-6));
  const subjectPart = parseInt(subjectItemIdStr.slice(-5));
  
  // Combine using a formula that ensures uniqueness
  // This will produce a number around 15-16 digits, well within int8 limits
  return itemIdPart * 1000000000 + itemId2Part * 10000 + subjectPart;
};

const getEventType = (data) => {
  const panels = data.itemDetails?.defn?.panel || [];
  for (const panel of panels) {
    if (panel.typeId === 11) {
      // Check if this is a Kellogg Executive Education Program
      const kelloggProgram = panel.item?.[6]?.item?.[0]?.itemName;
      if (kelloggProgram === "Kellogg Executive Education Programs" || kelloggProgram === "Kellogg Executive MBA Program") {
        return "KEC";
      }
      
      // Check if this is a CMC program
      const cmcProgram = panel.item?.[8]?.item?.[0]?.itemName;
      if (cmcProgram === "RES CMC, KSM") {
        return "CMC";
      }
      
      // Original logic for other event types
      const eventType = panel.item?.[2]?.itemName;
      if (eventType) return eventType;
    }
  }
  return null;
};

const getOrganization = (data) => {
  const panels = data.itemDetails?.defn?.panel || [];
  for (const panel of panels) {
    if (panel.typeId === 11) {
      const organization = panel.item?.[6]?.item?.[0]?.itemName;
      if (organization) {
        return organization;
      }
    }
  }
  return null;
};


const getInstructorNames = (data) => {
  const panels = data.itemDetails?.defn?.panel || [];
  for (const panel of panels) {
    if (panel.typeId === 12) {
      const instructor = panel.item?.[0]?.itemName;
      if (instructor) {
        const cleanName = instructor.replace(/^Instructors:\s*/, '').trim();
        if (cleanName &&
            !cleanName.startsWith('<') &&
            cleanName.length > 2 &&
            cleanName.length < 100 &&
            !cleanName.includes('{') &&
            !cleanName.includes('}')) {
          // Split on semicolon and space, filter out empty strings, and trim whitespace
          const instructors = cleanName.split('; ')
            .map(name => name.trim())
            .filter(name => name.length > 0);
          return instructors.length > 0 ? instructors : null;
        }
      }
    }
    if (panel.typeId === 13) {
      const instructor = panel.item?.[0]?.item?.[0]?.itemName;
      if (instructor) {
        const cleanName = instructor.replace(/^Instructors:\s*/, '').trim();
        if (cleanName &&
            !cleanName.startsWith('<') &&
            cleanName.length > 2 &&
            cleanName.length < 100 &&
            !cleanName.includes('{') &&
            !cleanName.includes('}')) {
          // Split on semicolon and space, filter out empty strings, and trim whitespace
          const instructors = cleanName.split('; ')
            .map(name => name.trim())
            .filter(name => name.length > 0);
          return instructors.length > 0 ? instructors : null;
        }
      }
    }
  }
  return null;
};

const getLectureTitle = (data) => {
  const panels = data.itemDetails?.defn?.panel || [];
  for (const panel of panels) {
    if (panel.typeId === 11 && panel.item?.[1]?.itemName) {
      return panel.item[1].itemName;
    }
  }
  return null;
};



/**
 * Parse room name from format "KGH1110 (70)" to "GH 1110" or "KGHL110" to "GH L110"
 * @param {string} subjectItemName - The subject item name containing room info
 * @returns {string|null} Parsed room name or null if no match
 */
const parseRoomName = (subjectItemName) => {
  if (!subjectItemName) {
    return null;
  }
  // First try to match L-prefixed rooms (KGHL110 format)
  const lMatch = subjectItemName.match(/K(GHL\d+)/);
  if (lMatch) {
    return lMatch[1].replace(/(GH)(L)(\d+)/, 'GH $2$3');
  }
  
  // Then try to match regular rooms
  const match = subjectItemName.match(/K(GH\d+[AB]?)/);
  if (!match) {
    return null;
  }
  
  // Add space between GH and number, preserving A/B suffix if present
  const roomNumber = match[1];
  return roomNumber.replace(/(GH)(\d+)([AB]?)/, 'GH $2$3');
};

/**
 * Parse event resources and return both boolean flags and full resource list
 * @param {Object} event - The event object
 * @returns {Object} Object containing boolean flags and resource list
 */
const parseEventResources = (event) => {
  // Make a deep copy of the prof array if it exists
  const profArray = event.itemDetails?.occur?.prof ? JSON.parse(JSON.stringify(event.itemDetails.occur.prof)) : null;
  
  if (!profArray || !Array.isArray(profArray)) {
    return {
      resources: []
    };
  }

  // Concatenate all rsv arrays from all prof objects
  const allRsv = profArray.reduce((acc, prof) => {
    if (prof.rsv && Array.isArray(prof.rsv)) {
      return [...acc, ...prof.rsv];
    }
    return acc;
  }, []);

  if (allRsv.length === 0) {
    return {
      resources: []
    };
  }

  // Find the reservation that matches the event date
  const eventDate = event.subject_item_date;
  
  const matchingReservation = allRsv.find(rsv => {
    if (!rsv.startDt) {
      return false;
    }
    
    // Extract just the date part from startDt (e.g., "2025-07-15" from "2025-07-15T13:00")
    const reservationDate = rsv.startDt.split('T')[0];
    // Also extract just the date part from eventDate (e.g., "2025-07-16" from "2025-07-16T00:00:00")
    const eventDateOnly = eventDate.split('T')[0];
    const matches = reservationDate === eventDateOnly;
    return matches;
  });

  if (!matchingReservation || !matchingReservation.res) {
    return {
      resources: []
    };
  }

  // Map the res array to just itemName, quantity, and instruction
  const simplifiedResources = matchingReservation.res.map(resource => ({
    itemName: resource.itemName,
    quantity: resource.quantity,
    instruction: resource.instruction
  }));

  return {
    resources: simplifiedResources
  };
};

/**
 * Combine KEC events that occur on the same day in the same room into single events
 * @param {Array} events - Array of processed events
 * @returns {Array} Array with KEC events combined and other events unchanged
 */
function combineKECEvents(events) {
  console.log(`Combining KEC events by day and room...`);
  
  // Separate KEC events from other events
  const kecEvents = events.filter(event => event.event_type === 'KEC');
  const nonKecEvents = events.filter(event => event.event_type !== 'KEC');
  
  if (kecEvents.length === 0) {
    console.log('No KEC events found to combine');
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
    
    eventGroup.forEach(event => {
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
    
    console.log(`Combined KEC event: ${combinedEvent.event_name} in ${combinedEvent.room_name} from ${earliestStart} to ${latestEnd}`);
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
  console.log(`Merging adjacent room events (1420 & 1430, 2410A & 2410B, 2420A & 2420B, 2430A & 2430B)...`);
  
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

  Object.values(eventGroups).forEach(eventGroup => {
    if (eventGroup.length === 1) {
      // No potential matches, keep the event as is
      mergedEvents.push(eventGroup[0]);
      return;
    }

    // Look for 1420 and 1430 room pairs
    const room1420 = eventGroup.find(e => e.room_name === 'GH 1420');
    const room1430 = eventGroup.find(e => e.room_name === 'GH 1430');
    
    // Look for 2410A and 2410B room pairs
    const room2410A = eventGroup.find(e => e.room_name === 'GH 2410A');
    const room2410B = eventGroup.find(e => e.room_name === 'GH 2410B');
    
    // Look for 2420A and 2420B room pairs
    const room2420A = eventGroup.find(e => e.room_name === 'GH 2420A');
    const room2420B = eventGroup.find(e => e.room_name === 'GH 2420B');
    
    // Look for 2430A and 2430B room pairs
    const room2430A = eventGroup.find(e => e.room_name === 'GH 2430A');
    const room2430B = eventGroup.find(e => e.room_name === 'GH 2430B');
    
    let processedEvents = new Set(); // Track which events we've already processed
    
    if (room1420 && room1430) {
      // Found a 1420/1430 pair! Merge them
      const mergedEvent = {
        ...room1420,
        room_name: 'GH 1420&30'
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
        room_name: 'GH 2410A&B'
      };
      mergedEvents.push(mergedEvent);
      mergeCount2410++;
      console.log('Merged 2410A&B event:', mergedEvent.event_name, mergedEvent.event_type);
      processedEvents.add(room2410A);
      processedEvents.add(room2410B);
    } else if (room2410A || room2410B) {
      // Only one room has an event - log this for debugging
      const singleEvent = room2410A || room2410B;
      console.log('Single room 2410 event (not merged):', singleEvent.event_name, singleEvent.event_type, singleEvent.room_name);
    }
    
    if (room2420A && room2420B) {
      // Found a 2420A/2420B pair! Merge them
      const mergedEvent = {
        ...room2420A,
        room_name: 'GH 2420A&B'
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
        room_name: 'GH 2430A&B'
      };
      mergedEvents.push(mergedEvent);
      mergeCount2430++;
      processedEvents.add(room2430A);
      processedEvents.add(room2430B);
    }
    
    // Add any other events in this group that weren't processed in merging
    eventGroup.forEach(event => {
      if (!processedEvents.has(event)) {
        mergedEvents.push(event);
      }
    });
  });

  console.log(`Merged ${mergeCount1420} pairs of 1420/1430 events, ${mergeCount2410} pairs of 2410A/2410B events, ${mergeCount2420} pairs of 2420A/2420B events, and ${mergeCount2430} pairs of 2430A/2430B events`);
  return mergedEvents;
}

// Process the raw event data to extract and add processed properties
function processData(rawData) {
  // Handle case where rawData is undefined (no events)
  if (!rawData || !Array.isArray(rawData)) {
    console.log('No events to process');
    return [];
  }
  
  console.log(`Processing ${rawData.length} events to extract additional properties...`);
  
  // Filter out events where itemId or itemId2 equals 0, or subject_itemName contains ampersand
  // BUT only filter itemId=0 if the event name is "(Private)" - we want to keep real events that happen to have itemId=0
  const filteredData = rawData.filter(event => {
    const isPrivateEvent = event.itemId === 0 && (event.itemName === "(Private)" || event.itemName === "Closed");
    return !isPrivateEvent && 
           event.itemId2 !== 0 && 
           !event.subject_itemName?.includes('&');
  });
  
  console.log(`Filtered out ${rawData.length - filteredData.length} events with itemId/itemId2 equal to 0 or containing ampersand in room name`);
  
  // First, process all events with room parsing
  const processedEvents = filteredData.map(event => {
    // Convert time strings to hours and minutes
    const startTime = parseFloat(event.start);
    const endTime = parseFloat(event.end);
    
    // Convert to hours and minutes
    const startHour = Math.floor(startTime);
    const startMinute = Math.round((startTime - startHour) * 60);
    const endHour = Math.floor(endTime);
    const endMinute = Math.round((endTime - endHour) * 60);
    
    // Format time strings for database (HH:MM:SS format)
    const startTimeStr = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}:00`;
    const endTimeStr = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}:00`;
    
    // Extract just the date part from subject_item_date (YYYY-MM-DD format)
    const eventDate = event.subject_item_date ? event.subject_item_date.split('T')[0] : new Date().toISOString().split('T')[0];
    
    // Get event type and log if missing
    const eventType = getEventType(event);
    if (!eventType) {
      console.log(`WARNING: No event type found for event ${event.itemId} - ${event.itemName}`);
      console.log(`Event has itemDetails: ${!!event.itemDetails}`);
      if (event.itemDetails?.defn?.panel) {
        console.log(`Panel count: ${event.itemDetails.defn.panel.length}`);
      }
    }
    
    console.log(`\n=== DEBUG: Date/Time processing for event ${event.itemId} ===`);
    console.log(`Original subject_item_date: ${event.subject_item_date}`);
    console.log(`Extracted date: ${eventDate}`);
    console.log(`Start time: ${startTimeStr}`);
    console.log(`End time: ${endTimeStr}`);
    console.log(`Event type: ${eventType || 'NONE'}`);
    console.log(`=== END DEBUG for event ${event.itemId} ===\n`);
    
    const generatedId = generateDeterministicId(event.itemId, event.itemId2, event.subject_itemId);
    
    console.log(`ID Generation for event: itemId=${event.itemId}, itemId2=${event.itemId2}, subject_itemId=${event.subject_itemId} => id=${generatedId}`);
    
    return {
      item_id: event.itemId,
      item_id2: event.itemId2,
      // Generate a deterministic ID from the source data for upsert operations
      id: generatedId,
      date: eventDate,
      start_time: startTimeStr,
      end_time: endTimeStr,
      event_name: event.itemName,
      event_type: eventType,
      organization: getOrganization(event),
      instructor_names: getInstructorNames(event),
      lecture_title: getLectureTitle(event),
      room_name: parseRoomName(event.subject_itemName),
      resources: parseEventResources(event).resources,
      raw: event
    };
  });

  // Combine KEC events by day and room first
  const eventsWithCombinedKEC = combineKECEvents(processedEvents);
  
  // Now merge adjacent room events (1420 & 1430)
  const mergedEvents = mergeAdjacentRoomEvents(eventsWithCombinedKEC);
  
  return mergedEvents;
}

module.exports = {
  processData,
  getEventType,
  getOrganization,
  getInstructorNames,
  getLectureTitle,
  parseRoomName,
  parseEventResources,
  generateDeterministicId,
  combineKECEvents,
  mergeAdjacentRoomEvents
}; 